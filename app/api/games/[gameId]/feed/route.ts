import { NextResponse } from "next/server";

import { getGameFeed } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface FeedRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function GET(_request: Request, context: FeedRouteContext) {
  const { gameId } = await context.params;

  try {
    const feed = await getGameFeed(createSupabaseGameRepository(), gameId);
    return NextResponse.json({ feed });
  } catch (error) {
    console.error("Unable to load game feed", error);
    return NextResponse.json(
      { error: "Unable to load game feed" },
      { status: 500 },
    );
  }
}
