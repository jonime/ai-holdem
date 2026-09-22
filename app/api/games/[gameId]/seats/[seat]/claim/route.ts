import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { claimSeat } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { publishSeatEvent } from "@/lib/realtime/publish";

export const runtime = "nodejs";

interface ClaimSeatRouteContext {
  readonly params: Promise<{ gameId: string; seat: string }>;
}

export async function POST(request: Request, context: ClaimSeatRouteContext) {
  const { gameId, seat: seatValue } = await context.params;
  const seat = Number(seatValue);
  if (!Number.isInteger(seat) || seat < 0) {
    return NextResponse.json({ error: "Invalid seat number" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  const playerToken = getOrCreatePlayerToken(request, response);

  try {
    const assignment = await claimSeat(
      createSupabaseGameRepository(),
      gameId,
      seat,
      playerToken,
    );
    void publishSeatEvent(gameId, "seat_claimed", assignment);
    return NextResponse.json({ seat: assignment }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "Seat is not open") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message === "Seat does not exist") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Unable to claim seat", error);
    return NextResponse.json(
      { error: "Unable to claim seat" },
      { status: 500 },
    );
  }
}
