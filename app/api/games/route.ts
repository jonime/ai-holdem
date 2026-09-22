import { NextResponse } from "next/server";

import {
  getOrCreatePlayerToken,
  setPlayerTokenCookie,
} from "@/lib/identity/player-token";
import { createDemoGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const requestBody =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const seatCount =
      typeof requestBody.seatCount === "number" &&
      Number.isInteger(requestBody.seatCount) &&
      requestBody.seatCount >= 2 &&
      requestBody.seatCount <= 6
        ? requestBody.seatCount
        : undefined;
    if (requestBody.seatCount !== undefined && seatCount === undefined) {
      return NextResponse.json(
        { error: "seatCount must be an integer from 2 through 6" },
        { status: 400 },
      );
    }
    const hostName =
      typeof requestBody.hostName === "string"
        ? requestBody.hostName
        : undefined;
    const hostToken = getOrCreatePlayerToken(request);

    const game = await createDemoGame(createSupabaseGameRepository(), {
      seatCount,
      hostToken,
      hostName,
    });
    const response = NextResponse.json(
      { gameId: game.gameId },
      { status: 201 },
    );
    setPlayerTokenCookie(response, hostToken);
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
