import { gameParamsSchema } from "@/lib/http/common-contracts";
import { publicationRequestSchema, listingTitleSchema, type PublicationResponse } from "@/lib/http/discovery-contracts";
import { NextResponse } from "next/server";

import { getOrCreatePlayerToken } from "@/lib/identity/player-token";
import { setGamePublication } from "@/lib/poker/directory";
import { invalidatePublicDirectory } from "@/lib/poker/public-directory-cache";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: { readonly params: Promise<{ gameId: string }> }) {
  const path = gameParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid game ID" }, { status: 400 });
  const { gameId } = path.data;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const parsed = publicationRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid publication settings" }, { status: 400 });
  const values = parsed.data;
  if (typeof values.title === "string" && !listingTitleSchema.safeParse(values.title).success) {
    return NextResponse.json({ error: "Title must be 60 characters or fewer" }, { status: 400 });
  }
  try {
    const game = await setGamePublication(createSupabaseGameRepository(), {
      gameId,
      expectedVersion: values.expectedVersion,
      hostToken: getOrCreatePlayerToken(request),
      isPublic: values.isPublic,
      title: typeof values.title === "string" ? values.title : null,
    });
    invalidatePublicDirectory();
    return NextResponse.json({ version: game.version } satisfies PublicationResponse);
  } catch (error) {
    if (error instanceof GameConflictError) return NextResponse.json({ error: "Game changed", code: "GAME_CONFLICT" }, { status: 409 });
    if (error instanceof Error && error.message === "Only the host can change publication") return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("Unable to update publication", error);
    return NextResponse.json({ error: "Unable to update publication" }, { status: 500 });
  }
}
