import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { getPublicGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface GameRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function GET(request: Request, context: GameRouteContext) {
  const { gameId } = await context.params;

  try {
    const game = await getPublicGame(createSupabaseGameRepository(), gameId);
    const response = NextResponse.json({ game });
    getOrCreatePlayerToken(request, response);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "GameNotFoundError") {
      const response = NextResponse.json(
        { error: "Game not found" },
        { status: 404 },
      );
      getOrCreatePlayerToken(request, response);
      return response;
    }

    console.error("Unable to load game", error);
    const response = NextResponse.json(
      { error: "Unable to load game" },
      { status: 500 },
    );
    getOrCreatePlayerToken(request, response);
    return response;
  }
}
