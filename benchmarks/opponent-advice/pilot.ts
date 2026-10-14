import type { BotContext, PokerBot } from "@/lib/bots/types";
import type { ProviderFetch } from "@/lib/bots/provider-request";
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";
import { JevPokerBot } from "@/lib/bots/jev";
import { LlmPokerBot } from "@/lib/bots/llm";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { cappedBot, liveDecisionBudget } from "../poker-context-harness";
import { openRouterPilotFetch, sanitizedDiagnostics } from "../heads-up-pilot";
import { failureCategory } from "../heads-up/experiment";
import { opponentAdvice, adviceVersion } from "./advice";
import { adviceFixtures, conditions, type Condition } from "./fixtures";

export const policies = ["current", "advice"] as const;
export type Policy = typeof policies[number];
export const providers = ["jev", "mini"] as const;
export const model = "openai/gpt-5.4-mini";
function augmented(context: BotContext) {
  const items = opponentAdvice(context);
  return items.length ? { ...context, benchmarkOpponentAdvice: { version: adviceVersion, items } } : context;
}
/** Intercept only the benchmark request: production policies/candidates remain intact. */
export function pilotBots(client: TypesafeDecisionClient, fetcher: ProviderFetch): Record<typeof providers[number], Record<Policy, PokerBot>> {
  const adviceClient: TypesafeDecisionClient = { evaluate(request) {
    const context = request.state as BotContext;
    return client.evaluate({ ...request, state: augmented(context) });
  } };
  const adviceFetch: ProviderFetch = (url, init) => {
    const body = JSON.parse(String(init.body));
    const messages = body.messages.map((message: { role: string; content: string }) => message.role === "user" ? { ...message, content: JSON.stringify(augmented(JSON.parse(message.content))) } : message);
    return fetcher(url, { ...init, body: JSON.stringify({ ...body, messages }) });
  };
  return { jev: { current: new JevPokerBot(client), advice: new JevPokerBot(adviceClient) },
    mini: { current: new LlmPokerBot(model, { profileId: "balanced", reasoning: "low" }, fetcher),
      advice: new LlmPokerBot(model, { profileId: "balanced", reasoning: "low" }, adviceFetch) } };
}
export function preflight() {
  const budget = liveDecisionBudget();
  if (budget.remaining > 960) throw new Error("Plan 3 cap cannot exceed 960");
  if (process.env.OPPONENT_ADVICE_PAID_AUTHORIZATION !== "plan-3-960") throw new Error("Fresh explicit paid authorization required");
  if (!process.env.TYPESAFE_API_KEY?.trim() || !process.env.LLM_API_KEY?.trim()) throw new Error("Both provider credentials required");
  if (process.env.LLM_API_ENDPOINT !== "https://openrouter.ai/api/v1/chat/completions") throw new Error("Exact OpenRouter endpoint required");
  return budget;
}
export function livePilotBots(client: TypesafeDecisionClient, budget: { remaining: number }, onReserve: () => void = () => {}) {
  const bots = pilotBots(client, openRouterPilotFetch());
  return Object.fromEntries(providers.map(provider => [provider, Object.fromEntries(policies.map(policy => [policy, cappedBot({ decide(context) { onReserve(); return bots[provider][policy].decide(context); } }, budget)]))])) as typeof bots;
}
export interface PilotRow {
  fixture: string; provider: typeof providers[number]; condition: Condition; policy: Policy; repetition: number;
  action: string | null; sizing: string | null; failure: string | null; latencyMs: number;
  diagnostics: ReturnType<typeof sanitizedDiagnostics> | null; adviceItems: number;
}
export async function evaluatePilot(bots: ReturnType<typeof pilotBots>, fixtures = adviceFixtures(), progress: (rows: readonly PilotRow[]) => void = () => {}) {
  const rows: PilotRow[] = [];
  for (let repetition = 0; repetition < 5; repetition++) for (const [index, fixture] of fixtures.entries()) {
    // Rotate histories and alternate provider/policy order over cases and repetitions.
    const shift = (index + repetition) % conditions.length;
    const order = [...conditions.slice(shift), ...conditions.slice(0, shift)];
    for (const condition of order) for (const provider of (index + repetition) % 2 ? [...providers].reverse() : providers) {
      for (const policy of (index + repetition) % 2 ? [...policies].reverse() : policies) {
        const context = fixture.contexts[condition], started = performance.now();
        const row: PilotRow = { fixture: fixture.id, provider, condition, policy, repetition, action: null, sizing: null, failure: null, latencyMs: 0, diagnostics: null, adviceItems: policy === "advice" ? opponentAdvice(context).length : 0 };
        try {
          const decision = await bots[provider][policy].decide(context);
          engine.applyAction(fixture.state, engine.snapshot(fixture.state).currentActorId!, decision.action);
          row.action = JSON.stringify(decision.action); row.sizing = decision.diagnostics.sizing?.choice ?? null;
          row.diagnostics = sanitizedDiagnostics(decision.diagnostics);
        } catch (error) {
          if (error instanceof Error && error.message === "Decision-call cap exhausted") return rows;
          row.failure = failureCategory(error);
        } finally { row.latencyMs = performance.now() - started; }
        rows.push(row); progress(rows);
      }
    }
  }
  return rows;
}
export function summarizePilot(rows: readonly PilotRow[]) {
  const distribution = (values: readonly string[]) => Object.fromEntries([...new Set(values)].map(value => [value, { count: values.filter(v => v === value).length, denominator: values.length }]));
  const groups = [...new Set(rows.map(r => `${r.fixture}:${r.provider}:${r.condition}:${r.policy}`))].map(key => {
    const selected = rows.filter(r => `${r.fixture}:${r.provider}:${r.condition}:${r.policy}` === key);
    const successful = selected.filter(r => r.action !== null), latency = successful.map(r => r.latencyMs).sort((a,b) => a-b);
    const costs = successful.flatMap(r => r.diagnostics?.cost === null || r.diagnostics?.cost === undefined ? [] : [r.diagnostics.cost]);
    return { key, attempts: selected.length, successes: successful.length, failures: selected.filter(r => r.failure).length,
      actions: distribution(successful.map(r => r.action!)), sizings: distribution(successful.map(r => r.sizing ?? "none")),
      latencyMs: { median: latency.length ? latency[Math.floor(latency.length / 2)] : null, p95: latency.length ? latency[Math.min(latency.length - 1, Math.floor(latency.length * .95))] : null },
      cost: { reported: costs.reduce((a,b) => a+b, 0), coveredRequests: costs.length, attempts: selected.length } };
  });
  const contrasts = [...new Set(rows.map(r => `${r.fixture}:${r.provider}:${r.condition}`))].map(key => {
    const selected = rows.filter(r => `${r.fixture}:${r.provider}:${r.condition}` === key);
    const matched = Array.from({ length: 5 }, (_, repetition) => selected.filter(r => r.repetition === repetition));
    const complete = matched.filter(pair => pair.length === 2 && pair.every(r => r.action !== null));
    return { key, completePairs: complete.length, excludedPairs: 5 - complete.length,
      changedActions: complete.filter(pair => pair[0].action !== pair[1].action).length,
      control: key.endsWith(":omitted") ? "stochastic" : key.endsWith(":insufficient") ? "unsupported_adaptation_watch" : "sensitivity",
      adviceSuppressed: selected.every(r => r.adviceItems === 0) };
  });
  const historyContrasts = [...new Set(rows.map(r => `${r.fixture}:${r.provider}:${r.policy}`))].flatMap(key => conditions.filter(c => c !== "omitted").map(condition => {
    const selected = rows.filter(r => `${r.fixture}:${r.provider}:${r.policy}` === key);
    const pairs = Array.from({ length: 5 }, (_, repetition) => selected.filter(r => r.repetition === repetition && (r.condition === "omitted" || r.condition === condition)));
    const complete = pairs.filter(pair => pair.length === 2 && pair.every(r => r.action !== null));
    const changes = complete.filter(pair => pair[0].action !== pair[1].action).length;
    return { key, condition, completePairs: complete.length, excludedPairs: 5 - complete.length, changedActions: changes,
      unsupportedAdaptationFlag: condition === "insufficient" && changes > 0,
      interpretation: condition === "insufficient" ? "Review against omitted stochastic controls; action change alone is not an exact mistake." : "Behavioral history sensitivity, ungraded." };
  }));
  return { groups, contrasts, historyContrasts, failures: rows.filter(r => r.failure).length, interpretation: "Fixed-decision sensitivity and safety only; no win-rate or ordinary action-quality claim. Omitted controls measure stochastic variability; insufficient-observation action changes require review, not automatic error grading." };
}
