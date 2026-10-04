import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { assignBotToSeat } from "@/lib/poker/game-service";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { scheduleSeatEvent } from "@/lib/realtime/schedule";
import type { AIDifficulty } from "@/lib/poker/types";
import { getBotCatalog } from "@/lib/bots/registry";
import { isBotPlaystyleId } from "@/lib/bots/llm-playstyles";

interface AssignBotRouteContext {
  readonly params: Promise<{ gameId: string; seat: string }>;
}

export async function POST(request: Request, context: AssignBotRouteContext) {
  const { gameId, seat: seatValue } = await context.params;
  const seat = Number(seatValue);
  if (!Number.isInteger(seat) || seat < 0) {
    return NextResponse.json({ error: "Invalid seat number" }, { status: 400 });
  }

  const playerToken = getOrCreatePlayerToken(request);
  const body: unknown = await request.json().catch(() => null);
  const requestedDifficulty =
    body && typeof body === "object" && "difficulty" in body
      ? (body as Record<string, unknown>).difficulty
      : undefined;
  const requestedBotId =
    body && typeof body === "object" && "botId" in body
      ? (body as Record<string, unknown>).botId
      : undefined;
  const requestedProfileId =
    body && typeof body === "object" && "botProfileId" in body
      ? (body as Record<string, unknown>).botProfileId
      : undefined;
  const expectedVersion = body && typeof body === "object" ? (body as Record<string, unknown>).expectedVersion : undefined;
  if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0) {
    return NextResponse.json({ error: "Invalid expected version" }, { status: 400 });
  }
  if (requestedBotId !== undefined && typeof requestedBotId !== "string") {
    return NextResponse.json({ error: "Invalid bot ID" }, { status: 400 });
  }
  const bot = getBotCatalog().find(
    (candidate) => candidate.id === (requestedBotId ?? "jev"),
  );
  if (!bot) {
    return NextResponse.json({ error: "Unknown bot ID" }, { status: 400 });
  }
  if (
    requestedProfileId !== undefined &&
    requestedProfileId !== null &&
    !isBotPlaystyleId(requestedProfileId)
  ) {
    return NextResponse.json(
      { error: "Invalid bot playstyle" },
      { status: 400 },
    );
  }
  if (bot.provider !== "llm" && requestedProfileId != null) {
    return NextResponse.json(
      { error: "Bot playstyle is only supported by LLM bots" },
      { status: 400 },
    );
  }
  if (
    requestedDifficulty !== undefined &&
    requestedDifficulty !== "easy" &&
    requestedDifficulty !== "medium" &&
    requestedDifficulty !== "hard"
  ) {
    return NextResponse.json(
      { error: "Invalid AI difficulty" },
      { status: 400 },
    );
  }
  const difficulty: AIDifficulty = requestedDifficulty ?? "medium";

  try {
    const assignment = await assignBotToSeat(
      createSupabaseGameRepository(),
      gameId,
      seat,
      playerToken,
      difficulty,
      bot,
      bot.provider === "llm" ? (requestedProfileId ?? "balanced") : null,
      expectedVersion as number,
    );
    invalidatePublicDirectory();
    scheduleSeatEvent(gameId, "seat_bot_assigned");
    return NextResponse.json({ seat: assignment }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.name === "GameConflictError") {
      return NextResponse.json({ error: "Game changed", code: "GAME_CONFLICT" }, { status: 409 });
    }
    if (
      error instanceof Error &&
      error.message === "Only the host can assign bots"
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Seat is not open") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message === "Seat does not exist") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Unable to assign bot seat", error);
    return NextResponse.json(
      { error: "Unable to assign bot seat" },
      { status: 500 },
    );
  }
}
