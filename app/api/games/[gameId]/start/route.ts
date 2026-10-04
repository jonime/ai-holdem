import { startRequestSchema, gameParamsSchema, type GameResponseEnvelope } from "@/lib/http/gameplay-contracts";
import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { GameNotFoundError, startGame } from "@/lib/poker/game-service";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { scheduleGameEvent } from "@/lib/realtime/schedule";

interface StartRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function POST(request: Request, context: StartRouteContext) {
  const { gameId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const parsed = startRequestSchema.safeParse(body);
  if (!parsed.success || !gameParamsSchema.safeParse({ gameId }).success) {
    return NextResponse.json({ error: "Invalid start request" }, { status: 400 });
  }
  const input = parsed.data;
  const expectedVersion = input.expectedVersion;

  try {
    const game = await startGame(
      createSupabaseGameRepository(),
      gameId,
      expectedVersion,
      getOrCreatePlayerToken(request),
    );
    invalidatePublicDirectory();
    scheduleGameEvent(gameId, "hand_started", game.version);
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
