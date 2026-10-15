import type { PokerBot, BotContext } from "@/lib/bots/types";
import { BotProviderError } from "@/lib/bots/types";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { selectJevOpponentAdvice } from "@/lib/poker/opponent-advice";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { materialize, type AuditCase } from "./fixtures";
import { normalizedDecision } from "./mechanics";
import { diagnostics, failure, configuration } from "./providers";
import { observationSchema, type Observation } from "./report";
export async function observe(bot: PokerBot, f: AuditCase, built: ReturnType<typeof materialize>, provider: Observation["provider"], repetition: number, mode: Observation["mode"], difficulty: Observation["difficulty"] = "medium"): Promise<Observation> {
  const context: BotContext = { ...(mode === "native" ? built.native : built.controlled), difficulty };
  const row: Observation = { provider, fixture:f.id,section:f.section,hand:f.hand,weight:f.weight,difficulty,representation:built.representation,mode,repetition,action:null,failure:null,latencyMs:0,probabilities:null,sizingProbabilities:null,confidence:null,policy:null,model:null,usage:{},cost:null,adviceItems: provider === "jev" || provider === "eevo" ? selectJevOpponentAdvice(prepareProviderContext(context)).length : 0 };
  const started = performance.now();
  try {
    const d = await bot.decide(structuredClone(context));
    Object.assign(row, diagnostics(d));
    if (provider === "llm" && row.model !== null && row.model !== configuration.llm.model && !row.model.startsWith(`${configuration.llm.model}-`)) throw new BotProviderError("Audit returned unexpected model",undefined,{category:"invalid_response"});
    engine.applyAction(built.state,engine.snapshot(built.state).currentActorId!,d.action);
    row.action = normalizedDecision(d.action,context);
  } catch (error) { row.failure=failure(error); }
  row.latencyMs=Math.round(performance.now()-started);
  return observationSchema.parse(row);
}
