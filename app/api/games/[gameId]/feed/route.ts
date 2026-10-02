import { NextResponse } from "next/server";

import { getGameFeed } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface FeedRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function GET(request: Request, context: FeedRouteContext) {
  const { gameId } = await context.params;

  const values = new URL(request.url).searchParams.getAll("sinceHand");
  const sinceHand = values.length === 1 ? Number(values[0]) : undefined;
  if (
    values.length > 1 ||
    (values.length === 1 &&
      (!/^[0-9]+$/.test(values[0]) ||
        !Number.isInteger(sinceHand) ||
        Number(values[0]) > 2_147_483_647))
  ) {
    return NextResponse.json({ error: "Invalid sinceHand" }, { status: 400 });
  }

  try {
    const feed = await getGameFeed(
      createSupabaseGameRepository(),
      gameId,
      sinceHand,
    );
    return NextResponse.json({ feed });
  } catch (error) {
    console.error("Unable to load game feed", error);
    return NextResponse.json(
      { error: "Unable to load game feed" },
      { status: 500 },
    );
  }
}
