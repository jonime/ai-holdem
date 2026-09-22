import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { createDemoGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const game = await createDemoGame(createSupabaseGameRepository());
    const response = NextResponse.json(
      { gameId: game.gameId },
      { status: 201 },
    );
    getOrCreatePlayerToken(request, response);
    response.cookies.set("last-visited-game-id", game.gameId, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    console.error("Unable to create game", error);
    return NextResponse.json(
      { error: "Unable to create game" },
      { status: 500 },
    );
  }
}
