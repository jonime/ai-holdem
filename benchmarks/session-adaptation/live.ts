import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { BotProviderError } from "@/lib/bots/types";
import { SystemOneResponseError } from "@/lib/systemone/types";
import { liveBot } from "../bet-sizing/providers";
import { design, blocks, type Block, episodes, playHand, schedule } from "./session";
import { BudgetExhausted, Ledger, type Limits } from "./storage";
export function authorize(env: Record<string, string | undefined> = process.env, expectedAuthorization = "authorize-new-session-adaptation-4800", providers: readonly Block["provider"][] = design.providers) {
  if (env.SESSION_ADAPTATION_AUTHORIZATION !== expectedAuthorization || env.BOT_SCENARIO_LIVE !== "true" || env.EXTERNAL_INFERENCE_ENABLED !== "true" || env.BOT_DECISION_CALL_CAP !== "5000") throw new Error("Fresh session authorization, both inference opt-ins and cap 5000 required");
  for (const key of [...(providers.includes("jev") ? ["TYPESAFE_API_KEY"] : []), ...(providers.includes("llm") ? ["LLM_API_KEY"] : [])]) if (!env[key]?.trim() || /^(your_|placeholder|test[-_]?key)/i.test(env[key]!)) throw new Error("Scheduled provider credentials required");
  if (env.LLM_API_ENDPOINT !== "https://openrouter.ai/api/v1/chat/completions") throw new Error("Exact OpenRouter endpoint required");
}
export function verify(files: Record<string, string>) { for (const [path, hash] of Object.entries(files)) if (createHash("sha256").update(readFileSync(path)).digest("hex") !== hash) throw new Error("Source freeze mismatch"); }
export async function live(path: string, manifestHash: string, files: Record<string, string>, continuation?: { blocks: Block[]; limits: Limits; beforeDispatch: () => void; authorization?: "authorize-session-adaptation-llm-only-1200" }) {
  const scheduled = continuation?.blocks ?? blocks;
  authorize(process.env, continuation?.authorization ?? (continuation ? "authorize-session-adaptation-remaining-six-3600" : undefined), scheduled.map(b => b.provider)); verify(files);
  const ledger = new Ledger(path, scheduled, manifestHash, continuation?.limits);
  const interrupt = () => { ledger.evidence.status = "stopped"; ledger.evidence.failure = "interrupted"; ledger.save(); process.exit(130); };
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
  try {
    for (const block of scheduled) {
      const status = ledger.evidence.blocks.find(b => b.id === block.id)!; status.status = "running"; ledger.save();
      const arms = episodes(block);
      let location = { episode: "unstarted", hand: 0 };
      console.log(`[block ${scheduled.indexOf(block) + 1}/${scheduled.length}] ${block.id}; allocation ${design.blockCap}`);
      try {
        for (let hand = 1; hand <= design.hands; hand++) for (const index of schedule(block.order, hand)) {
          const episode = arms[index]; let decisionIndex = 0; location = { episode: episode.id, hand };
          await playHand(episode, block, hand, {
            async decide(context) {
              if (ledger.evidence.requests.filter(r => r.block === block.id).length >= 600) throw new BudgetExhausted();
              let slot: number | undefined;
              const bot = liveBot(block.provider, "current", () => {
                if (slot !== undefined) throw new Error("Multiple HTTP requests forbidden");
                continuation?.beforeDispatch();
                slot = ledger.reserve(block.id, episode.id, hand, decisionIndex++);
                console.log(`[request ${ledger.evidence.requests.length}/${ledger.limits.requestCap}; combined ${ledger.limits.priorRequests + ledger.evidence.requests.length}/${ledger.limits.combinedCap}] ${episode.id} hand ${hand}/60 dispatch; block remaining ${600 - ledger.evidence.requests.filter(r => r.block === block.id).length}`);
              });
              const decision = await bot.decide(context);
              if (slot === undefined) throw new Error("Missing dispatch reservation");
              ledger.complete(slot); console.log(`[request ${ledger.evidence.requests.length}] response received`);
              return decision;
            },
            decision(row) { ledger.evidence.decisions.push(row); ledger.save(); },
            completed(row) { ledger.evidence.hands.push(row); ledger.save(); console.log(`[hand] ${episode.id} ${hand}/60 complete; ${row.profitBB} BB`); },
          });
        }
        status.status = "complete";
      } catch (error) { if (error instanceof BudgetExhausted) { status.status = "budget"; console.log(`[block] ${block.id} exhausted; excluded in full from paired comparisons`); } else { status.status = "failed"; ledger.evidence.failures.push({ block: block.id, ...location, category: error instanceof BotProviderError ? error.category : error instanceof SystemOneResponseError ? "invalid_response" : "engine_or_invariant" }); throw error; } }
      ledger.save();
    }
    ledger.evidence.status = "complete"; ledger.save();
  } catch { ledger.evidence.status = "stopped"; ledger.evidence.failure = "provider_parse_engine_or_invariant_failure"; ledger.save(); throw new Error("Run stopped; partial evidence saved. Never resume or replay this allocation."); }
  finally { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt); }
  return ledger.evidence;
}
