import { NextResponse } from "next/server";

import {
  getOrCreatePlayerToken,
  setPlayerTokenCookie,
} from "@/lib/identity/player-token";
import { hasLocale } from "@/lib/i18n";
import { createDemoGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ lang: string }> },
) {
  const { lang } = await params;
  if (!hasLocale(lang)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const hostToken = getOrCreatePlayerToken(request);
    const game = await createDemoGame(createSupabaseGameRepository(), {
      hostToken,
    });
    const response = NextResponse.redirect(
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
    console.error("Unable to create game", error);
    return new NextResponse("Unable to create game", { status: 500 });
  }
}
