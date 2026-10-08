import { TurnTimerError } from "@/lib/poker/turn-timer";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { gameParamsSchema } from "@/lib/http/common-contracts";
import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { GameNotFoundError, submitHumanAction } from "@/lib/poker/game-service";
import { HumanActionError } from "@/lib/poker/human-actions";
import { submitActionRequestSchema, GAME_VERSION_CONFLICT, type GameResponseEnvelope } from "@/lib/http/gameplay-contracts";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { scheduleGameEvent } from "@/lib/realtime/schedule";

interface ActionRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function POST(request: Request, context: ActionRouteContext) {
  const path = gameParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid game ID" }, { status: 400 });
  const { gameId } = path.data;
  const body: unknown = await request.json().catch(() => null);
  const parsed = submitActionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action request" }, { status: 400 });
  }
  const { action, expectedVersion } = parsed.data;

  try {
    const game = await submitHumanAction(
      createSupabaseGameRepository(),
      gameId,
      {
        expectedVersion,
        playerId: getOrCreatePlayerToken(request),
        action,
      },
    );
    if (game.status === "complete") invalidatePublicDirectory();
    scheduleGameEvent(
      gameId,
      game.poker.street === "complete" ? "hand_completed" : "player_action",
      game.version,
    );
    return NextResponse.json({ game } satisfies GameResponseEnvelope);
  } catch (error) {
    if (error instanceof TurnTimerError) return NextResponse.json({ error: error.code, code: error.code }, { status: 409 });
    if (error instanceof GameNotFoundError) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    if (error instanceof HumanActionError) {
      if (error.message === "Game version is stale") {
        return NextResponse.json(
          { error: "Game version conflict", code: GAME_VERSION_CONFLICT },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof GameConflictError) {
      return NextResponse.json(
        { error: "Game version conflict", code: GAME_VERSION_CONFLICT },
        { status: 409 },
      );
    }

    console.error("Unable to submit human action", error);
    return NextResponse.json(
      { error: "Unable to submit human action" },
      { status: 500 },
    );
  }
}
