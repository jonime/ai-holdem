import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { GameNotFoundError, startGame } from "@/lib/poker/game-service";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { publishGameEvent, toBroadcastGame } from "@/lib/realtime/publish";

export const runtime = "nodejs";

interface StartRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function POST(request: Request, context: StartRouteContext) {
  const { gameId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const expectedVersion =
    body && typeof body === "object" && "expectedVersion" in body
      ? (body as Record<string, unknown>).expectedVersion
      : null;
  if (
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    return NextResponse.json(
      { error: "Invalid start request" },
      { status: 400 },
    );
  }

  try {
    const game = await startGame(
      createSupabaseGameRepository(),
      gameId,
      expectedVersion,
      getOrCreatePlayerToken(request),
    );
    void publishGameEvent(gameId, "hand_started", game.version, {
      game: toBroadcastGame(game),
    });
    return NextResponse.json({ game });
  } catch (error) {
    if (error instanceof GameNotFoundError) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    if (error instanceof GameConflictError) {
      return NextResponse.json(
        { error: "Game version conflict" },
        { status: 409 },
      );
    }
    if (
      error instanceof Error &&
      (error.message === "Only the host can start the game" ||
        error.message === "At least two seats are required")
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Unable to start game", error);
    return NextResponse.json(
      { error: "Unable to start game" },
      { status: 500 },
    );
  }
}
