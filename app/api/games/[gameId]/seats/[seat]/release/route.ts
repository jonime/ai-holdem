import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { releaseSeat } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { publishSeatEvent } from "@/lib/realtime/publish";

interface ReleaseSeatRouteContext {
  readonly params: Promise<{ gameId: string; seat: string }>;
}

export async function POST(request: Request, context: ReleaseSeatRouteContext) {
  const { gameId, seat: seatValue } = await context.params;
  const seat = Number(seatValue);
  if (!Number.isInteger(seat) || seat < 0) {
    return NextResponse.json({ error: "Invalid seat number" }, { status: 400 });
  }

  const playerToken = getOrCreatePlayerToken(request);

  try {
    const assignment = await releaseSeat(
      createSupabaseGameRepository(),
      gameId,
      seat,
      playerToken,
    );
    void publishSeatEvent(gameId, "seat_released", assignment);
    return NextResponse.json({ seat: assignment }, { status: 200 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Seat does not belong to this player"
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Seat does not exist") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Unable to release seat", error);
    return NextResponse.json(
      { error: "Unable to release seat" },
      { status: 500 },
    );
  }
}
