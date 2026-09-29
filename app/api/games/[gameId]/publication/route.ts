import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { setGamePublication } from "@/lib/poker/directory";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: { readonly params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const values = body as Record<string, unknown>;
  if (!Number.isSafeInteger(values.expectedVersion) || typeof values.isPublic !== "boolean" || (values.title !== undefined && values.title !== null && typeof values.title !== "string")) {
    return NextResponse.json({ error: "Invalid publication settings" }, { status: 400 });
  }
  if (typeof values.title === "string" && values.title.trim().length > 60) {
    return NextResponse.json({ error: "Title must be 60 characters or fewer" }, { status: 400 });
  }
  try {
    const game = await setGamePublication(createSupabaseGameRepository(), {
      gameId,
      expectedVersion: values.expectedVersion as number,
      hostToken: getOrCreatePlayerToken(request),
      isPublic: values.isPublic,
      title: typeof values.title === "string" ? values.title : null,
    });
    return NextResponse.json({ version: game.version });
  } catch (error) {
    if (error instanceof GameConflictError) return NextResponse.json({ error: "Game changed", code: "GAME_CONFLICT" }, { status: 409 });
    if (error instanceof Error && error.message === "Only the host can change publication") return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("Unable to update publication", error);
    return NextResponse.json({ error: "Unable to update publication" }, { status: 500 });
  }
}
