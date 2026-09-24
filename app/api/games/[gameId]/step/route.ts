import { NextResponse } from "next/server";

import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import {
  GameNotFoundError,
  stepBotAction,
} from "@/lib/poker/game-service";
import { ServerBotRegistry } from "@/lib/bots/registry";
import { BotProviderError } from "@/lib/bots/types";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { TypesafeRequestError } from "@/lib/typesafe/client";
import { TypesafeResponseError } from "@/lib/typesafe/types";
import { publishGameEvent, toBroadcastGame } from "@/lib/realtime/publish";

interface StepRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function POST(request: Request, context: StepRouteContext) {
  const { gameId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const expectedVersion =
    body && typeof body === "object" && "expectedVersion" in body
      ? (body as Record<string, unknown>).expectedVersion
      : null;
  if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0) {
    return NextResponse.json({ error: "Invalid expected version" }, { status: 400 });
  }

  try {
    const result = await stepBotAction(
      createSupabaseGameRepository(),
      new ServerBotRegistry(),
      gameId,
      expectedVersion as number,
      getPlayerTokenFromRequest(request),
    );
    void publishGameEvent(
      gameId,
      result.game.poker.street === "complete"
        ? "hand_completed"
        : "ai_decision",
      result.game.version,
      {
        game: toBroadcastGame(result.game),
        aiDecision: result.aiDecision,
      },
    );
    return NextResponse.json(result);
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
      error instanceof TypesafeRequestError ||
      error instanceof TypesafeResponseError ||
      error instanceof BotProviderError ||
      (error instanceof Error && error.message === "External inference is disabled")
    ) {
      return NextResponse.json(
        { error: "AI decision failed" },
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
