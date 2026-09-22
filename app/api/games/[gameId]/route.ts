import { NextResponse } from "next/server";

import { GameNotFoundError, getPublicGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface GameRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function GET(_request: Request, context: GameRouteContext) {
  const { gameId } = await context.params;

  try {
    const game = await getPublicGame(createSupabaseGameRepository(), gameId);
    return NextResponse.json({ game });
  } catch (error) {
    if (error instanceof GameNotFoundError) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    console.error("Unable to load game", error);
    return NextResponse.json({ error: "Unable to load game" }, { status: 500 });
  }
}
