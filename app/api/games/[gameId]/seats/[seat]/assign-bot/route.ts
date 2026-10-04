import { assignBotRequestSchema, seatPathParamsSchema, type SeatResponse } from "@/lib/http/seat-contracts";
import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { assignBotToSeat } from "@/lib/poker/seat-service";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { scheduleSeatEvent } from "@/lib/realtime/schedule";
import { getBotCatalog } from "@/lib/bots/registry";

interface AssignBotRouteContext {
  readonly params: Promise<{ gameId: string; seat: string }>;
}

export async function POST(request: Request, context: AssignBotRouteContext) {
  const { gameId, seat: seatValue } = await context.params;
  const path = seatPathParamsSchema.safeParse({ gameId, seat: seatValue });
  if (!path.success) {
    return NextResponse.json({ error: "Invalid seat number" }, { status: 400 });
  }
  const seat = path.data.seat;

  const playerToken = getOrCreatePlayerToken(request);
  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  // Keep the historical field validation order and endpoint-specific messages.
  const version = assignBotRequestSchema.shape.expectedVersion.safeParse(input.expectedVersion);
  if (!version.success) {
    return NextResponse.json({ error: "Invalid expected version" }, { status: 400 });
  }
  const botId = assignBotRequestSchema.shape.botId.safeParse(input.botId);
  if (!botId.success) {
    return NextResponse.json({ error: "Invalid bot ID" }, { status: 400 });
  }
  const bot = getBotCatalog().find(candidate => candidate.id === (botId.data ?? "jev"));
  if (!bot) {
    return NextResponse.json({ error: "Unknown bot ID" }, { status: 400 });
  }
  const profile = assignBotRequestSchema.shape.botProfileId.safeParse(input.botProfileId);
  if (!profile.success) {
    return NextResponse.json({ error: "Invalid bot playstyle" }, { status: 400 });
  }
  if (bot.provider !== "llm" && profile.data != null) {
    return NextResponse.json({ error: "Bot playstyle is only supported by LLM bots" }, { status: 400 });
  }
  const difficulty = assignBotRequestSchema.shape.difficulty.safeParse(input.difficulty);
  if (!difficulty.success) {
    return NextResponse.json({ error: "Invalid AI difficulty" }, { status: 400 });
  }

  try {
    const assignment = await assignBotToSeat(
      createSupabaseGameRepository(),
      {
        gameId, seat, hostToken: playerToken, bot,
        difficulty: difficulty.data ?? "medium",
        botProfileId: bot.provider === "llm" ? (profile.data ?? "balanced") : null,
        expectedVersion: version.data,
      },
    );
    invalidatePublicDirectory();
    scheduleSeatEvent(gameId, "seat_bot_assigned");
    return NextResponse.json({ seat: assignment } satisfies SeatResponse, { status: 200 });
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
