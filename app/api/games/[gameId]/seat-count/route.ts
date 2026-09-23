import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { GameNotFoundError, updateSeatCount } from "@/lib/poker/game-service";
import { publishGameEvent, toBroadcastGame } from "@/lib/realtime/publish";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface SeatCountRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function PATCH(request: Request, context: SeatCountRouteContext) {
  const { gameId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const requestBody =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const seatCount = requestBody.seatCount;
  const expectedVersion = requestBody.expectedVersion;

  if (
    typeof seatCount !== "number" ||
    !Number.isInteger(seatCount) ||
    seatCount < 2 ||
    seatCount > 6
  ) {
    return NextResponse.json(
      { error: "seatCount must be an integer from 2 through 6" },
      { status: 400 },
    );
  }
  if (
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    return NextResponse.json(
      { error: "Invalid seat count request" },
      { status: 400 },
    );
  }

  try {
    const game = await updateSeatCount(
      createSupabaseGameRepository(),
      gameId,
      expectedVersion,
      seatCount,
      getOrCreatePlayerToken(request),
    );
    void publishGameEvent(gameId, "seat_count_updated", game.version, {
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
      error.message === "Only the host can change the seat count"
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (
      error instanceof Error &&
      (error.message === "The game is not waiting" ||
        error.message === "Cannot shrink seat count below an occupied seat")
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Unable to update seat count", error);
    return NextResponse.json(
      { error: "Unable to update seat count" },
      { status: 500 },
    );
  }
}
