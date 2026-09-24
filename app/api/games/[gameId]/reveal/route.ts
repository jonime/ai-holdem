import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { GameNotFoundError, revealHumanCards } from "@/lib/poker/game-service";
import { publishGameEvent, toBroadcastGame } from "@/lib/realtime/publish";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

interface RevealRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export async function POST(request: Request, context: RevealRouteContext) {
  const { gameId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const input =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (
    !isNonNegativeInteger(input.expectedVersion) ||
    !isNonNegativeInteger(input.handNumber)
  ) {
    return NextResponse.json(
      { error: "Invalid reveal request" },
      { status: 400 },
    );
  }

  try {
    const game = await revealHumanCards(
      createSupabaseGameRepository(),
      gameId,
      input.expectedVersion,
      input.handNumber,
      getOrCreatePlayerToken(request),
    );
    void publishGameEvent(gameId, "cards_revealed", game.version, {
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
      (error.message === "Cards can only be shown after a fold-ended hand" ||
        error.message === "Only a participating human can show cards" ||
        error.message === "The player was not dealt cards")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Unable to reveal human cards", error);
    return NextResponse.json(
      { error: "Unable to reveal human cards" },
      { status: 500 },
    );
  }
}
