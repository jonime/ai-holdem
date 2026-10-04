import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { releaseSeat } from "@/lib/poker/game-service";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { scheduleSeatEvent } from "@/lib/realtime/schedule";

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
  const body: unknown = await request.json().catch(() => null);
  const expectedVersion = body && typeof body === "object" ? (body as Record<string, unknown>).expectedVersion : undefined;
  if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0) {
    return NextResponse.json({ error: "Invalid expected version" }, { status: 400 });
  }

  try {
    const assignment = await releaseSeat(
      createSupabaseGameRepository(),
      gameId,
      seat,
      playerToken,
      expectedVersion as number,
    );
    invalidatePublicDirectory();
    scheduleSeatEvent(gameId, "seat_released");
    return NextResponse.json({ seat: assignment }, { status: 200 });
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
