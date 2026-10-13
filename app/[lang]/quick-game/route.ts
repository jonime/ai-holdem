import { CreationAttemptError } from "@/lib/poker/creation-attempt-errors";
import { creationAttemptArguments } from "@/lib/poker/creation-attempt";
import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { quickPlayRequestSchema } from "@/lib/http/creation-contracts";
import { readCreationHostName } from "@/lib/http/creation-form";
import { classifyApplicationFailure, logApplicationFailure } from "@/lib/logging/application-failure";
import { addLocalePrefix } from "@/lib/i18n";
import { admitGameCreation } from "@/lib/usage/creation";
import { usageCreationResponse } from "@/lib/usage/response";
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
  const parsed = quickPlayParamsSchema.safeParse({ lang, botMode: new URL(request.url).searchParams.get("botMode") ?? undefined });
  if (!parsed.success) {
    return failure("Not found", 404);
  }

  try {
    const json = request.headers.get("content-type")?.includes("application/json");
    const body: unknown = json ? await request.json().catch(() => ({})) : {};
    // Legacy JSON callers historically ignore names and malformed/absent bodies.
    const enhanced = quickPlayRequestSchema.safeParse(body && typeof body === "object" && "creationAttemptId" in body ? body : {});
    if (!enhanced.success) return failure("Invalid creation request", 400);
    const { creationAttemptId } = enhanced.data;
    const hostName = json ? (creationAttemptId ? enhanced.data.hostName : undefined) : await readCreationHostName(request);
    const hostToken = getOrCreatePlayerToken(request);
    if (creationAttemptId && !getPlayerTokenFromRequest(request)) return NextResponse.json({ error: "Cookies required", code: "CREATION_COOKIES_REQUIRED" }, { status: 400 });
    if (!creationAttemptId) await admitGameCreation(request, hostToken);
    const game = await createQuickPlayGame(createSupabaseGameRepository(creationAttemptId ? creationAttemptArguments(request, hostToken, creationAttemptId, { mode: "quick", hostName, botMode: parsed.data.botMode }) : undefined), {
      hostToken,
      ...(hostName !== undefined ? { hostName } : {}),
      ...(parsed.data.botMode ? { botMode: parsed.data.botMode } : {}),
    });
    const response = wantsJson
      ? NextResponse.json({ gameId: game.gameId } satisfies CreateGameResponse, { status: 201 })
      : NextResponse.redirect(
          new URL(addLocalePrefix(`/game/${game.gameId}`, parsed.data.lang), request.url),
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
    if (error instanceof CreationAttemptError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "CREATION_ATTEMPT_CONFLICT" ? 409 : 410 });
    const limited = await usageCreationResponse(error, wantsJson, parsed.data.lang);
    if (limited) return limited;
    logApplicationFailure({ operation: "create_quick_game_html", category: classifyApplicationFailure(error), status: 500 });
    return failure("Unable to create quick game", 500);
  }
}
