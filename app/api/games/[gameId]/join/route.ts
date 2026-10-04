import { NextResponse } from "next/server";

import { getOrCreatePlayerToken, setPlayerTokenCookie } from "@/lib/identity/player-token";
import { joinPublicGame } from "@/lib/poker/directory";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { scheduleSeatEvent } from "@/lib/realtime/schedule";

export async function POST(request: Request, context: { readonly params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const expectedVersion = (body as Record<string, unknown>).expectedVersion;
  const name = (body as Record<string, unknown>).name;
  if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0 || (name !== undefined && typeof name !== "string")) {
    return NextResponse.json({ error: "Invalid join request" }, { status: 400 });
  }
  const response = NextResponse.json({ ok: true });
  const playerToken = getOrCreatePlayerToken(request, response);
  try {
    const repository = createSupabaseGameRepository();
    const result = await joinPublicGame(repository, {
      gameId,
      expectedVersion: expectedVersion as number,
      playerToken,
      name: typeof name === "string" ? name : null,
    });
    if (result.outcome === "conflict") {
      const conflict = NextResponse.json({ error: "Game changed", code: "GAME_CONFLICT" }, { status: 409 });
      return setPlayerTokenCookie(conflict, playerToken);
    }
    if (result.outcome === "unavailable") {
      const unavailable = NextResponse.json({ error: "Game is no longer available", code: "GAME_UNAVAILABLE" }, { status: 410 });
      return setPlayerTokenCookie(unavailable, playerToken);
    }
    if (!result.duplicate) invalidatePublicDirectory();
    scheduleSeatEvent(gameId, "seat_claimed");
    const joined = NextResponse.json({ gameId, seat: result.seat, version: result.version });
    return setPlayerTokenCookie(joined, playerToken);
  } catch (error) {
    console.error("Unable to join public game", error);
    const failed = NextResponse.json({ error: "Unable to join game" }, { status: 500 });
    return setPlayerTokenCookie(failed, playerToken);
  }
}
