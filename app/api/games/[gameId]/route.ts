import { NextResponse } from "next/server";

import {
  getOrCreatePlayerToken,
  setPlayerTokenCookie,
} from "@/lib/identity/player-token";
import { getPublicGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface GameRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function GET(request: Request, context: GameRouteContext) {
  const { gameId } = await context.params;
  const playerToken = getOrCreatePlayerToken(request);

  try {
    const game = await getPublicGame(
      createSupabaseGameRepository(),
      gameId,
      playerToken,
    );
    const response = NextResponse.json({ game });
    setPlayerTokenCookie(response, playerToken);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "GameNotFoundError") {
      const response = NextResponse.json(
        { error: "Game not found" },
        { status: 404 },
      );
      setPlayerTokenCookie(response, playerToken);
      return response;
    }

    console.error("Unable to load game", error);
    const response = NextResponse.json(
      { error: "Unable to load game" },
      { status: 500 },
    );
    setPlayerTokenCookie(response, playerToken);
    return response;
  }
}
