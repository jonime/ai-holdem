import { NextResponse } from "next/server";
import { replayParamsSchema, replayResponseSchema, replayErrorResponseSchema } from "@/lib/http/replay-contracts";
import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { getHandReplay, ReplayOutcome } from "@/lib/poker/hand-replay";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyApplicationFailure, logApplicationFailure } from "@/lib/logging/application-failure";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request, context: { params: Promise<{ gameId: string; handNumber: string }> }) {
  const path = replayParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid replay parameters" }, { status: 400, headers });
  const { gameId, handNumber } = path.data;
  try {
    const replay = await getHandReplay(async () => {
      const { data, error } = await createSupabaseServerClient().rpc("get_hand_replay", { p_game_id: gameId, p_hand_number: handNumber });
      if (error) throw new Error("Replay read failed");
      return data;
    }, gameId, handNumber, getPlayerTokenFromRequest(request));
    return NextResponse.json(replayResponseSchema.parse({ replay }), { headers });
  } catch (error) {
    if (error instanceof ReplayOutcome) return NextResponse.json(replayErrorResponseSchema.parse({ code: error.code, error: "Replay unavailable" }),
      { status: error.code === "REPLAY_MISSING" ? 404 : error.code === "REPLAY_UNFINISHED" ? 409 : 422, headers });
    const requestReference = logApplicationFailure({ operation: "replay", category: classifyApplicationFailure(error), status: 500 });
    return NextResponse.json({ requestReference, error: "Unable to load replay" }, { status: 500, headers });
  }
}
