import type { BotContext, PokerBot } from "@/lib/bots/types";
import { emptyDiagnostics } from "@/lib/bots/types";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { projectBotHistory, type BotHandContext } from "@/lib/poker/bot-history";
import type { AIDifficulty } from "@/lib/poker/types";
import { scriptedAggressivePolicy, scriptedPassivePolicy } from "../policy-harness";
import { ExperimentalRulesBot, variants, type Variant } from "./challenger";
import { rulesContextFromProjection } from "./context";

export const difficulties = ["easy", "medium", "hard"] as const;
export const opponents = ["frozen", "passive", "aggressive"] as const;
export type Opponent = typeof opponents[number];
export function randomSource(seed: number) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 2 ** 32; };
}
export function opponentBot(opponent: Opponent): PokerBot {
  if (opponent === "frozen") return new ExperimentalRulesBot("frozen");
  const policy = opponent === "passive" ? scriptedPassivePolicy : scriptedAggressivePolicy;
  return { async decide(context) { return { action: await policy.decide(context, () => 0), diagnostics: emptyDiagnostics(), rawResponse: null }; } };
}
export interface HandResult {
  profitBB: number;
  durationMs: number;
  actions: Record<string, number>;
  sizings: Record<string, number>;
  stages: Record<string, number>;
  latencies: number[];
  contextLatencies: number[];
  fallbackDecisions: number;
  decisions: number;
}
const increment = (counts: Record<string, number>, key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
export async function playHand(variant: Variant, opponent: Opponent, difficulty: AIDifficulty,
  seats: 2 | 6, rotation: number, seed: number, samples: number, subjectOverride?: PokerBot, beforeDecision?: (state: import("@/lib/poker/types").PokerGameState, history: BotHandContext, context: BotContext, isSubject: boolean) => void): Promise<HandResult> {
  const handStart = performance.now();
  const random = randomSource(seed), deck = [...createDeterministicDeck()];
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  let state = engine.startHand(engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: seats,
    players: Array.from({ length: seats }, (_, seat) => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, controller: "bot", stack: 200 })) }), deck);
  const initialState = state;
  const history: BotHandContext["actions"][number][] = [];
  const projected: import("@/lib/poker/ai-state").PokerAIDecisionHistoryItem[] = [];
  const subject = subjectOverride ?? new ExperimentalRulesBot(variant), other = opponentBot(opponent);
  const result: HandResult = { profitBB: 0, durationMs: 0, actions: {}, sizings: {}, stages: {}, latencies: [], contextLatencies: [], fallbackDecisions: 0, decisions: 0 };
  for (let sequence = 1; sequence <= 200 && engine.snapshot(state).street !== "complete"; sequence++) {
    const actor = engine.snapshot(state).currentActorId!;
    const isSubject = actor === `p${rotation}`;
    const contextStart = performance.now();
    const actorSeat = engine.decisionView(state).currentActorSeat;
    const visibleHistory = projected.map(item => ({ ...item,
      actor: item.actorSeat === actorSeat ? "hero" as const : "opponent" as const }));
    const context: BotContext = rulesContextFromProjection(state, { status: "complete", actions: visibleHistory },
      isSubject ? variant : "frozen", difficulty, isSubject || opponent === "frozen" ? samples : 1);
    const contextLatency = performance.now() - contextStart;
    beforeDecision?.(state, { version: 0, handNumber: 1, initialState, actions: history }, context, isSubject);
    const start = performance.now();
    const decision = await (isSubject ? subject : other).decide(context);
    const latency = performance.now() - start;
    const before = state;
    state = engine.applyAction(state, actor, decision.action);
    history.push({ sequence, action: decision.action, stateBefore: before });
    // Each step was just applied through the authoritative adapter. Project that single
    // validated transition and append its allowlisted facts; avoid quadratic full replays.
    const step = projectBotHistory({ version: 0, handNumber: 1, initialState: before,
      actions: [{ sequence: 1, action: decision.action, stateBefore: before }] }, state, actor);
    if (step.status !== "complete" || step.actions.length !== 1) throw new Error("Incomplete benchmark transition");
    projected.push({ ...step.actions[0], sequence });
    if (isSubject) {
      result.decisions++;
      result.latencies.push(latency);
      result.contextLatencies.push(contextLatency);
      increment(result.actions, decision.action.type);
      const action = decision.action;
      const sizing = (action.type === "bet" || action.type === "raise")
        ? context.sizingOptions.find(o => o.amount === action.amount)?.choice ?? "legal-other" : "not_applicable";
      increment(result.sizings, sizing);
      const stage = decision.diagnostics.matchedRule ?? "unknown";
      increment(result.stages, stage);
      if (stage.startsWith("fallback:")) result.fallbackDecisions++;
    }
  }
  if (engine.snapshot(state).street !== "complete") throw new Error("Hand action limit exceeded");
  result.profitBB = (engine.decisionView(state).players.find(p => p.seat === rotation)!.stack - 200) / 2;
  result.durationMs = performance.now() - handStart;
  return result;
}

export function bootstrapInterval(blocks: readonly number[], seed = 8017, repetitions = 2000) {
  if (blocks.length < 2) return null;
  const random = randomSource(seed), means: number[] = [];
  for (let n = 0; n < repetitions; n++) {
    let sum = 0;
    for (let i = 0; i < blocks.length; i++) sum += blocks[Math.floor(random() * blocks.length)];
    means.push(sum / blocks.length);
  }
  means.sort((a, b) => a - b);
  return { meanBBPerHand: blocks.reduce((a, b) => a + b, 0) / blocks.length,
    confidence95: [means[Math.floor(repetitions * 0.025)], means[Math.floor(repetitions * 0.975)]],
    method: "whole-seed-block-percentile-bootstrap", repetitions };
}
export async function compare(opponent: Opponent, difficulty: AIDifficulty, seats: 2 | 6, blocks = 500, samples = 100, handRunner: typeof playHand = playHand) {
  const rows: { seed: number; rotation: number; variant: Variant; result: HandResult | null; failure: string | null }[] = [];
  const excluded: { seed: number; failures: { rotation: number; variant: Variant; reason: string }[] }[] = [];
  const paired: Record<string, number[]> = { "facts-frozen": [], "structured-frozen": [], "structured-facts": [] };
  const completed = new Set<number>();
  for (let seed = 1; seed <= blocks; seed++) {
    const block: typeof rows = [];
    for (let rotation = 0; rotation < seats; rotation++) for (const variant of variants) {
      try { block.push({ seed, rotation, variant, result: await handRunner(variant, opponent, difficulty, seats, rotation, seed, samples), failure: null }); }
      catch (error) { block.push({ seed, rotation, variant, result: null,
        failure: error instanceof Error ? error.name + ": " + error.message : "Unknown benchmark failure" }); }
    }
    rows.push(...block);
    const failures = block.filter(row => !row.result).map(row => ({ rotation: row.rotation, variant: row.variant, reason: row.failure! }));
    if (failures.length) { excluded.push({ seed, failures }); continue; }
    completed.add(seed);
    const mean = (variant: Variant) => block.filter(row => row.variant === variant).reduce((sum, row) => sum + row.result!.profitBB, 0) / seats;
    paired["facts-frozen"].push(mean("facts") - mean("frozen"));
    paired["structured-frozen"].push(mean("structured") - mean("frozen"));
    paired["structured-facts"].push(mean("structured") - mean("facts"));
  }
  const summaries = variants.map(variant => {
    const results = rows.filter(row => row.variant === variant && completed.has(row.seed)).map(row => row.result!);
    const merge = (field: "actions" | "sizings" | "stages") => {
      const counts: Record<string, number> = {};
      for (const result of results) for (const [key, count] of Object.entries(result[field])) counts[key] = (counts[key] ?? 0) + count;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, count / Math.max(1, total)]));
    };
    const latencies = results.flatMap(row => row.latencies).sort((a, b) => a - b);
    const contexts = results.flatMap(row => row.contextLatencies).sort((a, b) => a - b);
    return { variant, meanHandLatencyMs: results.reduce((sum,row) => sum+row.durationMs,0) / Math.max(1,results.length), contextLatencyMs: { mean: contexts.reduce((a,b) => a+b,0) / Math.max(1,contexts.length), p95: contexts[Math.floor(contexts.length*.95)] ?? null }, completedHands: results.length, attemptedHands: blocks * seats,
      bbPer100: results.length ? results.reduce((sum, row) => sum + row.profitBB, 0) / results.length * 100 : null,
      actionFrequencies: merge("actions"), sizingFrequencies: merge("sizings"), stageFrequencies: merge("stages"),
      decisions: results.reduce((sum, row) => sum + row.decisions, 0), fallbackDecisions: results.reduce((sum, row) => sum + row.fallbackDecisions, 0),
      decisionLatencyMs: { mean: latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length), p95: latencies[Math.floor(latencies.length * .95)] ?? null } };
  });
  return { opponent, difficulty, seats, blocks, equitySamples: samples, completeBlocks: completed.size, excluded,
    paired: Object.fromEntries(Object.entries(paired).map(([key, values]) => [key, bootstrapInterval(values)])), summaries,
    // Synthetic per-hand profits support reanalysis without private engine states.
    profits: rows.map(({ seed, rotation, variant, result, failure }) => ({ seed, rotation, variant, profitBB: result?.profitBB ?? null, failure })) };
}
