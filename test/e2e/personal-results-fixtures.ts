import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Reuse a real completed fixture's validated states at distinct hand numbers.
// This fixture only exercises full-history paging/feed-window separation; hand 1
// retains its real actions and is the earliest tied losing highlight for replay.
const state = z.object({
  engineState: z.object({ handNumber: z.number(), hand: z.object({ handNumber: z.number() }).passthrough() }).passthrough(),
  handStartStacks: z.object({ handNumber: z.number() }).passthrough(),
}).passthrough();
function numbered(raw: unknown, handNumber: number) {
  const parsed = state.parse(raw);
  return { ...parsed, engineState: { ...parsed.engineState, handNumber, hand: { ...parsed.engineState.hand, handNumber } },
    handStartStacks: { ...parsed.handStartStacks, handNumber } };
}
/** Extend only a disposable fixture-owned table; no production or hosted credentials. */
export async function extendResultsHistory(gameId: string, count: number) {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (process.env.E2E_PRODUCTION !== "true" || process.env.E2E_BASE_URL || url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("History fixtures require isolated local production mode");
  const client = createClient(url.origin, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from("hands").select("initial_state,final_state").eq("game_id", gameId).eq("hand_number", 1).single();
  if (error || !data) throw new Error("Fixture history read failed");
  const hands = Array.from({ length: count - 1 }, (_, index) => ({ game_id: gameId, hand_number: index + 2, status: "complete",
    initial_state: numbered(data.initial_state, index + 2), final_state: numbered(data.final_state, index + 2), completed_at: new Date().toISOString() }));
  if ((await client.from("hands").insert(hands)).error) throw new Error("Fixture history insert failed");
  if ((await client.from("games").update({ current_state: numbered(data.final_state, count), hand_number: count, version: count + 100, status: "complete" }).eq("id", gameId)).error) throw new Error("Fixture table update failed");
}
