import { NextResponse } from "next/server";
import { exactShareParamsSchema, revokeShareSchema } from "@/lib/http/share-contracts";
import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { revokeOwnedShare } from "@/lib/poker/owned-shares";
import { logApplicationFailure, classifyApplicationFailure } from "@/lib/logging/application-failure";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function DELETE(request: Request, context: { params: Promise<{ token: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const path = exactShareParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid link" }, { status: 400, headers });
  try {
    return NextResponse.json(revokeShareSchema.parse(await revokeOwnedShare(getPlayerTokenFromRequest(request), path.data.token)), { headers });
  } catch (error) {
    const requestReference = logApplicationFailure({ operation: "replay_share", category: classifyApplicationFailure(error), status: 500 });
    return NextResponse.json({ requestReference, error: "Unable to revoke share" }, { status: 500, headers });
  }
}
