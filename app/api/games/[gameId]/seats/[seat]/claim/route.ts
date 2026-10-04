import { claimSeatRouteRequestSchema, seatPathParamsSchema, type SeatResponse } from "@/lib/http/seat-contracts";
import { NextResponse } from "next/server";

import {
  getOrCreatePlayerToken,
  setPlayerTokenCookie,
} from "@/lib/identity/player-token";
import { claimSeat } from "@/lib/poker/seat-service";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { scheduleSeatEvent } from "@/lib/realtime/schedule";

interface ClaimSeatRouteContext {
  readonly params: Promise<{ gameId: string; seat: string }>;
}

export async function POST(request: Request, context: ClaimSeatRouteContext) {
  const { gameId, seat: seatValue } = await context.params;
  const path = seatPathParamsSchema.safeParse({ gameId, seat: seatValue });
  if (!path.success) {
    return NextResponse.json({ error: "Invalid seat number" }, { status: 400 });
  }
  const seat = path.data.seat;

  const response = NextResponse.json({ ok: true });
  const playerToken = getOrCreatePlayerToken(request, response);
  const body: unknown = await request.json().catch(() => null);
  const parsed = claimSeatRouteRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid expected version" }, { status: 400 });
  const { expectedVersion } = parsed.data;
  const playerName = parsed.data.name;

  try {
    const assignment = await claimSeat(
      createSupabaseGameRepository(),
      { gameId, seat, playerToken, playerName, expectedVersion },
    );
    invalidatePublicDirectory();
    scheduleSeatEvent(gameId, "seat_claimed");
    const result = NextResponse.json({ seat: assignment } satisfies SeatResponse, { status: 200 });
    setPlayerTokenCookie(result, playerToken);
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "GameConflictError") {
      return NextResponse.json({ error: "Game changed", code: "GAME_CONFLICT" }, { status: 409 });
    }
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
