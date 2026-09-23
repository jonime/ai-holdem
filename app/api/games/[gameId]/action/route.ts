import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { GameNotFoundError, submitHumanAction } from "@/lib/poker/game-service";
import { HumanActionError } from "@/lib/poker/human-actions";
import type { PokerAction } from "@/lib/poker/types";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { publishGameEvent, toBroadcastGame } from "@/lib/realtime/publish";

interface ActionRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseAction(value: unknown): PokerAction | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const action = value as Record<string, unknown>;
  if (action.type === "fold" || action.type === "check") {
    return { type: action.type };
  }
  if (action.type === "call") {
    const amount = action.amount;
    return isNonNegativeInteger(amount)
      ? { type: "call", amount }
      : { type: "call" };
  }
  const amount = action.amount;
  if (
    (action.type === "bet" || action.type === "raise") &&
    isNonNegativeInteger(amount)
  ) {
    return { type: action.type, amount };
  }

  return null;
}

export async function POST(request: Request, context: ActionRouteContext) {
  const { gameId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const input =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const action = parseAction(input?.action);
  const expectedVersion = input?.expectedVersion;

  if (!action || !isNonNegativeInteger(expectedVersion)) {
    return NextResponse.json(
      { error: "Invalid action request" },
      { status: 400 },
    );
  }

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
    void publishGameEvent(
      gameId,
      game.poker.street === "complete" ? "hand_completed" : "player_action",
      game.version,
      {
        game: toBroadcastGame(game),
      },
    );
    return NextResponse.json({ game });
  } catch (error) {
    if (error instanceof GameNotFoundError) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    if (error instanceof HumanActionError) {
      if (error.message === "Game version is stale") {
        return NextResponse.json(
          { error: "Game version conflict" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof GameConflictError) {
      return NextResponse.json(
        { error: "Game version conflict" },
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
