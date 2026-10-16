import { ConfidenceAwareJevPokerBot } from "@/lib/bots/jev-confidence";
import { ConfidenceAwareEevoPokerBot } from "@/lib/bots/eevo-confidence";
import { LlmPokerBot } from "@/lib/bots/llm";
import { TypesafeSystemOneClient } from "@/lib/typesafe/client";
import type { BettingMenu } from "@/lib/systemone/questions";
import type { SystemOneDecisionClient } from "@/lib/systemone/decision";
import type { ProviderFetch } from "@/lib/bots/provider-request";

export const providers = ["jev", "llm"] as const;
export type Provider = typeof providers[number];
export const configuration = { jev: "jev-latest", llm: "openai/gpt-5.4-mini", reasoning: "low", playstyle: "balanced", difficulty: "medium" } as const;
/** No Eevo client is imported or constructed by the paid path. */
export function liveBot(provider: Provider, menu: BettingMenu, reserve: () => void, fetcher: ProviderFetch = fetch) {
  const guarded: ProviderFetch = (url, init) => {
    const endpoint = provider === "jev" ? "https://api.typesafe.ai/v1/systemone" : "https://openrouter.ai/api/v1/chat/completions";
    if (url !== endpoint || typeof init.body !== "string") throw new Error("Unfrozen endpoint/body");
    const body: unknown = JSON.parse(init.body);
    if (!body || typeof body !== "object" || !("model" in body) || body.model !== configuration[provider]) throw new Error("Unfrozen model");
    const request = provider === "llm" ? { ...init, body: JSON.stringify({ ...body, provider: { allow_fallbacks: false, require_parameters: true } }) } : init;
    reserve(); // Durable debit immediately before the single production HTTP request.
    return fetcher(url, request);
  };
  return provider === "jev" ? new ConfidenceAwareJevPokerBot(new TypesafeSystemOneClient(guarded), true, "jev-latest", menu)
    : new LlmPokerBot(configuration.llm, { profileId: "balanced", reasoning: "low", menu }, guarded);
}
export function scriptedSystemOne(provider: "jev" | "eevo", menu: BettingMenu, client: SystemOneDecisionClient) {
  return provider === "jev" ? new ConfidenceAwareJevPokerBot(client, true, "jev-latest", menu) : new ConfidenceAwareEevoPokerBot(client, menu);
}
export function scriptedAnswer(request: Parameters<SystemOneDecisionClient["evaluate"]>[0], selected: string) {
  const choices = Object.keys(request.questions.move.criteria);
  if (!choices.includes(selected)) throw new Error("Scripted choice unavailable");
  return { answers: { move: { type: "choice", choice: selected, confidence: 1, probabilities: Object.fromEntries(choices.map(c => [c, Number(c === selected)])) } } };
}
