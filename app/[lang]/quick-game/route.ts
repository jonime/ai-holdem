import { quickPlayParamsSchema, type CreateGameResponse } from "@/lib/http/creation-contracts";
import { NextResponse } from "next/server";

import {
  getOrCreatePlayerToken,
  setPlayerTokenCookie,
} from "@/lib/identity/player-token";
import { createQuickPlayGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ lang: string }> },
) {
  const wantsJson = request.headers.get("accept")?.split(",").some(
    value => value.trim().split(";")[0].toLowerCase() === "application/json",
  ) ?? false;
  const failure = (message: string, status: number) => wantsJson
    ? NextResponse.json({ error: message }, { status })
    : new NextResponse(message, { status });
  const { lang } = await params;
  if (!quickPlayParamsSchema.safeParse({ lang }).success) {
    return failure("Not found", 404);
  }

  try {
    const hostToken = getOrCreatePlayerToken(request);
    const game = await createQuickPlayGame(createSupabaseGameRepository(), {
      hostToken,
    });
    const response = wantsJson
      ? NextResponse.json({ gameId: game.gameId } satisfies CreateGameResponse, { status: 201 })
      : NextResponse.redirect(
          new URL(`/${lang}/game/${game.gameId}`, request.url),
          303,
        );
    setPlayerTokenCookie(response, hostToken);
    response.cookies.set("last-visited-game-id", game.gameId, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    console.error("Unable to create quick game", error);
    return failure("Unable to create quick game", 500);
  }
}
