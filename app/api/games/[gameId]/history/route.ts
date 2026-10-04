import { gameParamsSchema } from "@/lib/http/common-contracts";
import { historyRouteQuerySchema, type HistoryResponse } from "@/lib/http/history-contracts";
import { NextResponse } from "next/server";

import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface HistoryRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function GET(request: Request, context: HistoryRouteContext) {
  const path = gameParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid game ID" }, { status: 400 });
  const { gameId } = path.data;
  const parsed = historyRouteQuerySchema.safeParse({ hand: new URL(request.url).searchParams.get("hand") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid hand number" }, { status: 400 });
  }

  const handNumber = parsed.data.hand;

  try {
    const history = await createSupabaseGameRepository().getHandHistory(
      gameId,
      handNumber,
    );
    if (!history) {
      return NextResponse.json({ error: "Hand not found" }, { status: 404 });
    }
    return NextResponse.json({ history } satisfies HistoryResponse);
  } catch (error) {
    console.error("Unable to load hand history", error);
    return NextResponse.json(
      { error: "Unable to load hand history" },
      { status: 500 },
    );
  }
}
