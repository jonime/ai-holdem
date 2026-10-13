import { CreationAttemptError } from "@/lib/poker/creation-attempt-errors";
import { creationAttemptArguments } from "@/lib/poker/creation-attempt";
import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { classifyApplicationFailure, logApplicationFailure } from "@/lib/logging/application-failure";
import { admitGameCreation } from "@/lib/usage/creation";
import { usageCreationResponse } from "@/lib/usage/response";
import { negotiateLocale } from "@/lib/i18n/negotiation";
import { createGameRouteRequestSchema, type CreateGameResponse } from "@/lib/http/creation-contracts";
import { NextResponse } from "next/server";

import {
  getOrCreatePlayerToken,
  setPlayerTokenCookie,
} from "@/lib/identity/player-token";
import { createDemoGame } from "@/lib/poker/game-service";
import { createSupabaseGameRepository } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = createGameRouteRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "seatCount must be an integer from 2 through 6" }, { status: 400 });
    const { humanTurnSeconds, seatCount, hostName, creationAttemptId } = parsed.data;
    const hostToken = getOrCreatePlayerToken(request);

    if (creationAttemptId && !getPlayerTokenFromRequest(request)) return NextResponse.json({ error: "Cookies required", code: "CREATION_COOKIES_REQUIRED" }, { status: 400 });
    if (!creationAttemptId) await admitGameCreation(request, hostToken);
    const game = await createDemoGame(createSupabaseGameRepository(creationAttemptId ? creationAttemptArguments(request, hostToken, creationAttemptId, { ...parsed.data, mode: "custom" }) : undefined), {
      humanTurnSeconds,
      seatCount,
      hostToken,
      hostName,
    });
    const response = NextResponse.json(
      { gameId: game.gameId } satisfies CreateGameResponse,
      { status: 201 },
    );
    setPlayerTokenCookie(response, hostToken);
    response.cookies.set("last-visited-game-id", game.gameId, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    if (error instanceof CreationAttemptError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "CREATION_ATTEMPT_CONFLICT" ? 409 : 410 });
    const limited = await usageCreationResponse(error, !request.headers.get("content-type")?.includes("application/x-www-form-urlencoded"), negotiateLocale(request.headers.get("accept-language")));
    if (limited) return limited;
    logApplicationFailure({ operation: "create_game", category: classifyApplicationFailure(error), status: 500 });
    return NextResponse.json(
      { error: "Unable to create game" },
      { status: 500 },
    );
  }
}
