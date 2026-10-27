import { NextResponse } from "next/server";
import { shareTokenSchema, publicSharedReplaySchema } from "@/lib/http/share-contracts";
import { readSharedReplay, ShareOutcome } from "@/lib/poker/replay-sharing";
import { logApplicationFailure, classifyApplicationFailure } from "@/lib/logging/application-failure";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const token = shareTokenSchema.safeParse((await context.params).token);
  try {
    if (!token.success) throw new ShareOutcome("SHARE_UNAVAILABLE");
    return NextResponse.json(publicSharedReplaySchema.parse(await readSharedReplay(token.data)), { headers });
  } catch (error) {
    if (error instanceof ShareOutcome) return NextResponse.json({ error: "Replay unavailable", code: "SHARE_UNAVAILABLE" }, { status: 404, headers });
    const requestReference = logApplicationFailure({ operation: "replay_share", category: classifyApplicationFailure(error), status: 500 });
    return NextResponse.json({ requestReference, error: "Unable to load replay" }, { status: 500, headers });
  }
}
