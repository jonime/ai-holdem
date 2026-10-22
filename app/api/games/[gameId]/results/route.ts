import { NextResponse } from "next/server";
import { resultsParamsSchema, resultsResponseSchema } from "@/lib/http/results-contracts";
import { getPlayerTokenFromRequest } from "@/lib/identity/player-token";
import { getPersonalResults, ResultsMissing } from "@/lib/poker/personal-results";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyApplicationFailure, logApplicationFailure } from "@/lib/logging/application-failure";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const path = resultsParamsSchema.safeParse(await context.params);
  if (!path.success) return NextResponse.json({ error: "Invalid game parameters" }, { status: 400, headers });
  try {
    const client = createSupabaseServerClient();
    const results = await getPersonalResults(async (after, boundary) => {
      const { data, error } = await client.rpc("get_personal_results_page", {
        p_game_id: path.data.gameId, p_after_hand: after, ...(boundary === null ? {} : { p_through_hand: boundary }),
      });
      if (error) throw new Error("Results read failed");
      return data;
    }, getPlayerTokenFromRequest(request));
    return NextResponse.json(resultsResponseSchema.parse({ results }), { headers });
  } catch (error) {
    if (error instanceof ResultsMissing) return NextResponse.json({ error: "Table unavailable" }, { status: 404, headers });
    const requestReference = logApplicationFailure({ operation: "results", category: classifyApplicationFailure(error), status: 500 });
    return NextResponse.json({ requestReference, error: "Unable to load results" }, { status: 500, headers });
  }
}
