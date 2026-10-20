import { NextResponse } from "next/server";
import { shareListQuerySchema, shareListSchema } from "@/lib/http/share-contracts";
import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { listOwnedShares } from "@/lib/poker/owned-shares";
import { logApplicationFailure, classifyApplicationFailure } from "@/lib/logging/application-failure";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const query = shareListQuerySchema.safeParse(Object.fromEntries(search));
  if (!query.success || [...search.keys()].some(key => search.getAll(key).length !== 1)) return NextResponse.json({ error: "Invalid cursor" }, { status: 400, headers });
  try {
    return NextResponse.json(shareListSchema.parse(await listOwnedShares(getPlayerTokenFromRequest(request), query.data)), { headers });
  } catch (error) {
    const requestReference = logApplicationFailure({ operation: "replay_share", category: classifyApplicationFailure(error), status: 500 });
    return NextResponse.json({ requestReference, error: "Unable to list shares" }, { status: 500, headers });
  }
}
