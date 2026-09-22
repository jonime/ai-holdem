import { NextResponse } from "next/server";

import { createSupabaseGameRepository } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface HistoryRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function GET(request: Request, context: HistoryRouteContext) {
  const { gameId } = await context.params;
  const handNumber = Number(new URL(request.url).searchParams.get("hand"));
  if (!Number.isSafeInteger(handNumber) || handNumber < 1) {
    return NextResponse.json({ error: "Invalid hand number" }, { status: 400 });
  }

  try {
    const history = await createSupabaseGameRepository().getHandHistory(
      gameId,
      handNumber,
    );
    if (!history) {
      return NextResponse.json({ error: "Hand not found" }, { status: 404 });
    }
    return NextResponse.json({ history });
  } catch (error) {
    console.error("Unable to load hand history", error);
    return NextResponse.json(
      { error: "Unable to load hand history" },
      { status: 500 },
    );
  }
}
