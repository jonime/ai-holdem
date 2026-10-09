import { gameParamsSchema } from "@/lib/http/common-contracts";
import { tableSettingsSchema, type GameResponseEnvelope } from "@/lib/http/gameplay-contracts";
import { versionSchema } from "@/lib/http/common-contracts";
import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { GameNotFoundError } from "@/lib/poker/game-errors";
import { updateTableSettings, validateTableSettings } from "@/lib/poker/game-service";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import type { TableSettings } from "@/lib/poker/types";
import { scheduleGameEvent } from "@/lib/realtime/schedule";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface SettingsRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function PATCH(request: Request, context: SettingsRouteContext) {
  const path = gameParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid game ID" }, { status: 400 });
  const { gameId } = path.data;
  const body: unknown = await request.json().catch(() => null);
  const requestBody =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const parsed = tableSettingsSchema.safeParse(requestBody);
  if (!parsed.success) return NextResponse.json({ error: "Invalid table settings request" }, { status: 400 });
  const settings: TableSettings = parsed.data;
  const expectedVersion = requestBody.expectedVersion;

  try {
    validateTableSettings(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid settings" },
      { status: 400 },
    );
  }
  const version = versionSchema.safeParse(expectedVersion);
  if (!version.success) {
    return NextResponse.json(
      { error: "Invalid table settings request" },
      { status: 400 },
    );
  }

  try {
    const game = await updateTableSettings(
      createSupabaseGameRepository(),
      gameId,
      version.data,
      settings,
      getOrCreatePlayerToken(request),
    );
    invalidatePublicDirectory();
    scheduleGameEvent(gameId, "table_settings_updated", game.version);
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
