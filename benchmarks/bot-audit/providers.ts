import { ConfidenceAwareJevPokerBot } from "@/lib/bots/jev-confidence";
import { ConfidenceAwareEevoPokerBot } from "@/lib/bots/eevo-confidence";
import { LlmPokerBot } from "@/lib/bots/llm";
import { TypesafeSystemOneClient } from "@/lib/typesafe/client";
import { EevoSystemOneClient } from "@/lib/eevo/client";
import { ServerBotRegistry } from "@/lib/bots/registry";
import { BotProviderError, type BotDecision, type PokerBot } from "@/lib/bots/types";
import type { ProviderFetch } from "@/lib/bots/provider-request";
import type { Provider } from "./report";
export const configuration = { jev: { model: "jev-latest", difficulty: "medium", policy: "typesafe-poker-v4.1-confidence" }, eevo: { model: "eevo-1", difficulty: "medium", policy: "eevo-poker-v4.1-confidence" }, llm: { model: "openai/gpt-5.4-mini", reasoning: "low", playstyle: "balanced", policy: "llm-poker-v4.0-guided-balanced" } } as const;
export function assertRegistry() {
  const registry = new ServerBotRegistry();
  if (!(registry.get({ botId: "jev" }).bot instanceof ConfidenceAwareJevPokerBot) || !(registry.get({ botId: "eevo" }).bot instanceof ConfidenceAwareEevoPokerBot)) throw new Error("Production wrapper selection changed");
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {}; }
const identifier = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9/._:-]{1,160}$/.test(value) ? value : null;
/** Allowlist the metadata, never retain the response or reasoning. */
export function diagnostics(decision: BotDecision) {
  const d = decision.diagnostics, usage = record(d.usage), raw = record(decision.rawResponse);
  const body = record(raw.providerResponse ?? raw);
  const probabilities = d.probabilities === null ? null : Object.fromEntries(Object.entries(d.probabilities).filter(([k,v]) => /^(fold|check|call|bet|raise)(?:_to_\d+)?$/.test(k) && Number.isFinite(v) && v>=0 && v<=1));
  return { probabilities, sizingProbabilities: d.sizing?.probabilities ?? null, confidence: d.confidence,
    policy: identifier(d.promptVersion), model: identifier(body.model ?? body.model_version ?? body.version),
    usage: Object.fromEntries(["prompt_tokens","completion_tokens","total_tokens","input_tokens","output_tokens"].flatMap(k=>typeof usage[k]==="number" && Number.isFinite(usage[k]) && usage[k]>=0 ? [[k,usage[k]]] : [])),
    cost: d.cost !== null && Number.isFinite(d.cost) && d.cost >= 0 ? d.cost : null };
}
export function failure(error: unknown): "timeout"|"network"|"rate_limit"|"invalid_response"|"provider" {
  return error instanceof BotProviderError ? error.category : "provider";
}
export function liveBot(provider: Exclude<Provider,"rules">, onRequest: () => void, fetcher: ProviderFetch = fetch): PokerBot {
  // Preserve production deadline/body handling. Metadata is read from the returned
  // in-memory decision, never by an additional transport or a second request.
  const guarded: ProviderFetch = (url, init) => {
    const expected = provider === "jev" ? "https://api.typesafe.ai/v1/systemone" : provider === "eevo" ? "https://eevo.io/api/v1/systemone" : "https://openrouter.ai/api/v1/chat/completions";
    if (url !== expected) throw new Error("Unfrozen provider endpoint");
    onRequest();
    if (provider !== "llm") return fetcher(url,init);
    const body = record(JSON.parse(String(init.body)));
    if (body.model !== configuration.llm.model) throw new Error("Unfrozen LLM model");
    return fetcher(url,{...init,body:JSON.stringify({...body,provider:{allow_fallbacks:false,require_parameters:true}})});
  };
  return provider === "jev" ? new ConfidenceAwareJevPokerBot(new TypesafeSystemOneClient(guarded)) : provider === "eevo" ? new ConfidenceAwareEevoPokerBot(new EevoSystemOneClient(guarded)) : new LlmPokerBot(configuration.llm.model,{profileId:"balanced",reasoning:"low"},guarded);
}
