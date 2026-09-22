import { NextResponse } from "next/server";

import { GameNotFoundError, startNextHand } from "@/lib/poker/game-service";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface NextHandRouteContext {
  readonly params: Promise<{ gameId: string }>;
}

export async function POST(request: Request, context: NextHandRouteContext) {
  const { gameId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const expectedVersion =
    body && typeof body === "object" && "expectedVersion" in body
      ? (body as Record<string, unknown>).expectedVersion
      : null;

  if (
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    return NextResponse.json(
      { error: "Invalid next hand request" },
      { status: 400 },
    );
  }

  try {
    const game = await startNextHand(
      createSupabaseGameRepository(),
      gameId,
      expectedVersion,
    );
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
      error.message === "The current hand has not completed"
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Unable to start next hand", error);
    return NextResponse.json(
      { error: "Unable to start next hand" },
      { status: 500 },
    );
  }
}
