import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import {
  GameNotFoundError,
  updatePlayerName,
} from "@/lib/poker/game-service";
import { publishSeatEvent } from "@/lib/realtime/publish";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface PlayerNameRouteContext {
  readonly params: Promise<{ gameId: string; seat: string }>;
}

export async function PATCH(request: Request, context: PlayerNameRouteContext) {
  const { gameId, seat: seatValue } = await context.params;
  const seat = Number(seatValue);
  if (!Number.isInteger(seat) || seat < 0) {
    return NextResponse.json({ error: "Invalid seat number" }, { status: 400 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { name?: unknown }).name !== "string"
  ) {
    return NextResponse.json(
      { error: "Player name must be a string" },
      { status: 400 },
    );
  }

  try {
    const assignment = await updatePlayerName(
      createSupabaseGameRepository(),
      gameId,
      seat,
      getOrCreatePlayerToken(request),
      (body as { name: string }).name,
    );
    void publishSeatEvent(gameId, "seat_name_updated", assignment);
    return NextResponse.json({ seat: assignment }, { status: 200 });
  } catch (error) {
    if (error instanceof GameNotFoundError) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Seat does not exist") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof Error &&
      error.message === "Seat does not belong to this player"
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (
      error instanceof Error &&
      error.message === "Player names can only be changed before the game starts"
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Unable to update player name", error);
    return NextResponse.json(
      { error: "Unable to update player name" },
      { status: 500 },
    );
  }
}
