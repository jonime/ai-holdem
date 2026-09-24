import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { assignBotToSeat } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { publishSeatEvent } from "@/lib/realtime/publish";
import type { AIDifficulty } from "@/lib/poker/types";
import { getBotCatalog } from "@/lib/bots/registry";

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
    );
    void publishSeatEvent(gameId, "seat_bot_assigned", assignment);
    return NextResponse.json({ seat: assignment }, { status: 200 });
  } catch (error) {
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
