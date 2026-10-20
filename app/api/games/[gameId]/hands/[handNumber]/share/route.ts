import { NextResponse } from "next/server";
import { replayParamsSchema } from "@/lib/http/replay-contracts";
import { shareManagementSchema, revokeShareSchema } from "@/lib/http/share-contracts";
import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { manageReplayShare, ShareOutcome } from "@/lib/poker/replay-sharing";
import { UsageUnavailableError } from "@/lib/usage/errors";
import { ReplayOutcome } from "@/lib/poker/hand-replay";
import { logApplicationFailure, classifyApplicationFailure } from "@/lib/logging/application-failure";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
type Context = { params: Promise<{ gameId: string; handNumber: string }> };
async function manage(request: Request, context: Context, operation: "read" | "create" | "revoke") {
  if (operation !== "read" && (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }
  const path = replayParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid parameters" }, { status: 400, headers });
  try {
    const result = await manageReplayShare(request, path.data.gameId, path.data.handNumber, getPlayerTokenFromRequest(request), operation);
    return NextResponse.json(operation === "revoke" ? revokeShareSchema.parse({ revoked: true }) : shareManagementSchema.parse(result), { headers });
  } catch (error) {
    if (error instanceof UsageUnavailableError) return NextResponse.json({ error: "Share creation temporarily unavailable", code: "USAGE_UNAVAILABLE" }, { status: 503, headers });
    if (error instanceof ShareOutcome || error instanceof ReplayOutcome) {
      const status = error.code === "SHARE_FORBIDDEN" ? 403 : error.code === "SHARE_CONFLICT" ? 409 : error.code === "SHARE_CREATION_LIMIT" ? 429 : 404;
      return NextResponse.json({ error: "Share unavailable", code: error.code, ...(error instanceof ShareOutcome && error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}) }, { status, headers: { ...headers, ...(error instanceof ShareOutcome && error.retryAfterMs ? { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } : {}) } });
    }
    const requestReference = logApplicationFailure({ operation: "replay_share", category: classifyApplicationFailure(error), status: 500 });
    return NextResponse.json({ requestReference, error: "Unable to manage share" }, { status: 500, headers });
  }
}
export const GET = (request: Request, context: Context) => manage(request, context, "read");
export const POST = (request: Request, context: Context) => manage(request, context, "create");
export const DELETE = (request: Request, context: Context) => manage(request, context, "revoke");
