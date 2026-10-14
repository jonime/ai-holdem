import type { BotContext, PokerBot } from "@/lib/bots/types";
import { failureCategory } from "../heads-up/experiment";
import type { pilotBots } from "./pilot";

/** HEAD checks send no credentials and make no inference requests. */
export async function networkPreflight(fetcher: typeof fetch = fetch) {
  for (const url of ["https://api.typesafe.ai", "https://openrouter.ai"]) {
    let response: Response;
    try { response = await fetcher(url, { method: "HEAD", signal: AbortSignal.timeout(10000) }); }
    catch { throw new Error("Provider connectivity preflight failed; no inference started"); }
    if (response.status === 429 || response.status >= 500) throw new Error("Provider connectivity preflight unavailable; no inference started");
  }
}
/** One shared stop across both providers and policies; failed cells are never replayed. */
export function stopAfterFailure(original: ReturnType<typeof pilotBots>) {
  let failure: string | null = null;
  const wrap = (bot: PokerBot): PokerBot => ({ async decide(context: BotContext) {
    if (failure !== null) throw new Error("Decision-call cap exhausted");
    try { return await bot.decide(context); }
    catch (error) { failure = failureCategory(error); throw error; }
  } });
  return { bots: { jev: { current: wrap(original.jev.current), advice: wrap(original.jev.advice) },
    mini: { current: wrap(original.mini.current), advice: wrap(original.mini.advice) } }, failure: () => failure };
}
