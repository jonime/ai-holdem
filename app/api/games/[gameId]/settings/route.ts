import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import {
  GameNotFoundError,
  updateTableSettings,
  validateTableSettings,
} from "@/lib/poker/game-service";
import type { TableSettings } from "@/lib/poker/types";
import { publishGameEvent, toBroadcastGame } from "@/lib/realtime/publish";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface SettingsRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function PATCH(request: Request, context: SettingsRouteContext) {
  const { gameId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const requestBody =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (
    typeof requestBody.seatCount !== "number" ||
    typeof requestBody.smallBlind !== "number" ||
    typeof requestBody.bigBlind !== "number" ||
    typeof requestBody.startingStack !== "number" ||
    typeof requestBody.botsShowUncontestedWins !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Invalid table settings request" },
      { status: 400 },
    );
  }
  const settings: TableSettings = {
    seatCount: requestBody.seatCount,
    smallBlind: requestBody.smallBlind,
    bigBlind: requestBody.bigBlind,
    startingStack: requestBody.startingStack,
    botsShowUncontestedWins: requestBody.botsShowUncontestedWins,
  };
  const expectedVersion = requestBody.expectedVersion;

  try {
    validateTableSettings(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid settings" },
      { status: 400 },
    );
  }
  if (
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    return NextResponse.json(
      { error: "Invalid table settings request" },
      { status: 400 },
    );
  }

  try {
    const game = await updateTableSettings(
      createSupabaseGameRepository(),
      gameId,
      expectedVersion,
      settings,
      getOrCreatePlayerToken(request),
    );
    void publishGameEvent(gameId, "table_settings_updated", game.version, {
      game: toBroadcastGame(game),
    });
    return NextResponse.json({ game });
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
      error.message === "Only the host can change table settings"
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
    console.error("Unable to update table settings", error);
    return NextResponse.json(
      { error: "Unable to update table settings" },
      { status: 500 },
    );
  }
}
