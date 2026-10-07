import { gameParamsSchema } from "@/lib/http/common-contracts";
import { feedRouteQuerySchema, type FeedResponse } from "@/lib/http/feed-contracts";
import { NextResponse } from "next/server";

import { getGameFeed } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface FeedRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function GET(request: Request, context: FeedRouteContext) {
  const path = gameParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid game ID" }, { status: 400 });
  const { gameId } = path.data;

  const parsed = feedRouteQuerySchema.safeParse({ sinceHand: new URL(request.url).searchParams.getAll("sinceHand") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid sinceHand" }, { status: 400 });
  const { sinceHand } = parsed.data;

  try {
    const feed = await getGameFeed(
      createSupabaseGameRepository(),
      gameId,
      sinceHand,
    );
    return NextResponse.json({ feed } satisfies FeedResponse);
  } catch (error) {
    console.error("Unable to load game feed", error);
    return NextResponse.json(
      { error: "Unable to load game feed" },
      { status: 500 },
    );
  }
}
