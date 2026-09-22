import { NextResponse } from "next/server";

import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import {
  GameNotFoundError,
  stepTypesafeAction,
} from "@/lib/poker/game-service";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { TypesafeSystemOneClient } from "@/lib/typesafe/client";
import { TypesafeRequestError } from "@/lib/typesafe/client";
import { TypesafeResponseError } from "@/lib/typesafe/types";
import { publishGameEvent, toBroadcastGame } from "@/lib/realtime/publish";

export const runtime = "nodejs";

interface StepRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function POST(request: Request, context: StepRouteContext) {
  const { gameId } = await context.params;

  try {
    const result = await stepTypesafeAction(
      createSupabaseGameRepository(),
      new TypesafeSystemOneClient(),
      gameId,
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
      error instanceof TypesafeResponseError
    ) {
      return NextResponse.json(
        { error: "AI decision failed" },
        { status: 502 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "It is not a TypeSafe AI turn"
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Unable to step TypeSafe AI", error);
    return NextResponse.json({ error: "AI decision failed" }, { status: 500 });
  }
}
