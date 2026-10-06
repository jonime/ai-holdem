import { usageJsonResponse } from "@/lib/usage/response";
import { BotStepInProgressError, BotStepClaimLostError } from "@/lib/poker/bot-step-claims";
import { gameParamsSchema } from "@/lib/http/common-contracts";
import { stepBotRequestSchema, GAME_VERSION_CONFLICT, botFailureCodes, type BotStepResponseEnvelope } from "@/lib/http/gameplay-contracts";
import { NextResponse } from "next/server";

import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import {
  GameNotFoundError,
  BotStepForbiddenError,
  stepBotAction,
} from "@/lib/poker/game-service";
import { ServerBotRegistry } from "@/lib/bots/registry";
import { BotProviderError } from "@/lib/bots/types";
import { logBotProviderFailure } from "@/lib/bots/provider-logging";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { TypesafeRequestError } from "@/lib/typesafe/client";
import { TypesafeResponseError } from "@/lib/typesafe/types";
import { scheduleGameEvent } from "@/lib/realtime/schedule";

// Allow database processing and notification cleanup around the provider deadline.
export const maxDuration = 90;

interface StepRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function POST(request: Request, context: StepRouteContext) {
  const path = gameParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid game ID" }, { status: 400 });
  const { gameId } = path.data;
  const body: unknown = await request.json().catch(() => null);
  const parsed = stepBotRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid expected version" }, { status: 400 });
  }
  const { expectedVersion } = parsed.data;

  try {
    const result = await stepBotAction(
      createSupabaseGameRepository(),
      new ServerBotRegistry(),
      gameId,
      expectedVersion,
      getPlayerTokenFromRequest(request),
    );
    scheduleGameEvent(
      gameId,
      result.game.poker.street === "complete"
        ? "hand_completed"
        : "ai_decision",
      result.game.version,
    );
    return NextResponse.json(result satisfies BotStepResponseEnvelope);
  } catch (error) {
    const limited = usageJsonResponse(error);
    if (limited) return limited;
    if (error instanceof BotStepInProgressError) {
      return NextResponse.json({ error: "Bot step in progress", code: "BOT_STEP_IN_PROGRESS", retryAfterMs: error.retryAfterMs }, { status: 409 });
    }
    if (error instanceof BotStepClaimLostError) {
      return NextResponse.json({ error: "Bot step claim lost", code: "BOT_STEP_CLAIM_LOST" }, { status: 409 });
    }
    if (error instanceof BotStepForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof GameNotFoundError) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    if (error instanceof GameConflictError) {
      return NextResponse.json(
        { error: "Game version conflict", code: GAME_VERSION_CONFLICT },
        { status: 409 },
      );
    }
    if (
      error instanceof TypesafeRequestError ||
      error instanceof TypesafeResponseError ||
      error instanceof BotProviderError ||
      (error instanceof Error && error.message === "External inference is disabled")
    ) {
      logBotProviderFailure(gameId, error);
      return NextResponse.json(
        { error: "AI decision failed", code: botFailureCodes[
          error instanceof BotProviderError ? error.category
            : error instanceof TypesafeResponseError ? "invalid_response" : "provider"
        ] },
        { status: 502 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "It is not a bot turn"
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Unable to step bot", error);
    return NextResponse.json({ error: "AI decision failed" }, { status: 500 });
  }
}
