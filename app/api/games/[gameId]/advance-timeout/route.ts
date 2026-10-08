import { TurnTimerError } from "@/lib/poker/turn-timer";
import { NextResponse } from "next/server";
import { gameParamsSchema } from "@/lib/http/common-contracts";
import { advanceTimeoutRequestSchema, GAME_VERSION_CONFLICT, type GameResponseEnvelope } from "@/lib/http/gameplay-contracts";
import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { advanceTimeout, BotStepForbiddenError, GameNotFoundError } from "@/lib/poker/game-service";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { GameConflictError } from "@/lib/supabase/queries";
import { scheduleGameEvent } from "@/lib/realtime/schedule";

export async function POST(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const path = gameParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid game ID" }, { status: 400 });
  const input = advanceTimeoutRequestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid expected version" }, { status: 400 });
  try {
    const game = await advanceTimeout(createSupabaseGameRepository(), path.data.gameId,
      input.data.expectedVersion, input.data.decisionId, getPlayerTokenFromRequest(request));
    if (game.status === "complete") invalidatePublicDirectory();
    scheduleGameEvent(game.id, game.status === "complete" ? "hand_completed" : "player_action", game.version);
    return NextResponse.json({ game } satisfies GameResponseEnvelope);
  } catch (error) {
    if (error instanceof TurnTimerError) return NextResponse.json({ error: error.code, code: error.code, ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}) }, { status: error.code === "TURN_FORBIDDEN" ? 403 : 409 });
    if (error instanceof BotStepForbiddenError) return NextResponse.json({ error: error.message, code: "TURN_FORBIDDEN" }, { status: 403 });
    if (error instanceof GameNotFoundError) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    if (error instanceof GameConflictError) return NextResponse.json({ error: "Game version conflict", code: GAME_VERSION_CONFLICT }, { status: 409 });
    console.error("Unable to advance timeout", { gameId: path.data.gameId });
    return NextResponse.json({ error: "Unable to advance timeout", code: "TURN_ADVANCE_FAILED" }, { status: 500 });
  }
}
