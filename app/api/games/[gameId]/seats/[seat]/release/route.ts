import { releaseSeatRequestSchema, seatPathParamsSchema, type SeatResponse } from "@/lib/http/seat-contracts";
import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { releaseSeat } from "@/lib/poker/seat-service";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { scheduleSeatEvent } from "@/lib/realtime/schedule";

interface ReleaseSeatRouteContext {
  readonly params: Promise<{ gameId: string; seat: string }>;
}

export async function POST(request: Request, context: ReleaseSeatRouteContext) {
  const { gameId, seat: seatValue } = await context.params;
  const path = seatPathParamsSchema.safeParse({ gameId, seat: seatValue });
  if (!path.success) {
    return NextResponse.json({ error: "Invalid seat number" }, { status: 400 });
  }
  const seat = path.data.seat;

  const playerToken = getOrCreatePlayerToken(request);
  const body: unknown = await request.json().catch(() => null);
  const parsed = releaseSeatRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid expected version" }, { status: 400 });
  const { expectedVersion } = parsed.data;

  try {
    const assignment = await releaseSeat(
      createSupabaseGameRepository(),
      { gameId, seat, playerToken, expectedVersion },
    );
    invalidatePublicDirectory();
    scheduleSeatEvent(gameId, "seat_released");
    return NextResponse.json({ seat: assignment } satisfies SeatResponse, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.name === "GameConflictError") {
      return NextResponse.json({ error: "Game changed", code: "GAME_CONFLICT" }, { status: 409 });
    }
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
