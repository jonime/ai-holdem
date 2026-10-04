import { gameParamsSchema } from "@/lib/http/common-contracts";
import { seatCountSchema, type GameResponseEnvelope } from "@/lib/http/gameplay-contracts";
import { versionSchema } from "@/lib/http/common-contracts";
import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { GameNotFoundError, updateSeatCount } from "@/lib/poker/game-service";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { scheduleGameEvent } from "@/lib/realtime/schedule";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface SeatCountRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function PATCH(request: Request, context: SeatCountRouteContext) {
  const path = gameParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid game ID" }, { status: 400 });
  const { gameId } = path.data;
  const body: unknown = await request.json().catch(() => null);
  const requestBody =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const seatCount = requestBody.seatCount;
  const expectedVersion = requestBody.expectedVersion;

  const count = seatCountSchema.safeParse(seatCount);
  if (!count.success) {
    return NextResponse.json({ error: "seatCount must be an integer from 2 through 6" }, { status: 400 });
  }
  const version = versionSchema.safeParse(expectedVersion);
  if (!version.success) {
    return NextResponse.json(
      { error: "Invalid seat count request" },
      { status: 400 },
    );
  }

  try {
    const game = await updateSeatCount(
      createSupabaseGameRepository(),
      gameId,
      version.data,
      count.data,
      getOrCreatePlayerToken(request),
    );
    invalidatePublicDirectory();
    scheduleGameEvent(gameId, "seat_count_updated", game.version);
    return NextResponse.json({ game } satisfies GameResponseEnvelope);
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
