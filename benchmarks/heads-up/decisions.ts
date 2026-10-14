import { createHash } from "node:crypto";
import { projectSessionStats } from "@/lib/poker/session-stats";
import { pokerEngineAdapter as engine, createDeterministicDeck } from "@/lib/poker/adapter";
import { handClasses, evaluationContext } from "../poker-context-harness";
import type { BotHandContext } from "@/lib/poker/bot-history";
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";
import type { PokerBot } from "@/lib/bots/types";
import type { PokerAction } from "@/lib/poker/types";
import { sanitizedDiagnostics } from "../heads-up-pilot";
import { engineAction, matchReference, sampleEntry, scoreReference, frequencyDeviation, seededRandom, type Reference, type ReferenceNode } from "./reference";
import { BudgetExhausted, failureCategory, chartVariants, type RequestBudget } from "./experiment";

export function referenceFixture(node: ReferenceNode, cards: readonly string[], samples = 5000, opponentCards?: readonly string[]) {
  const bb = 100; // Exact 0.01 BB chips; incompatible finer amounts are rejected by the engine.
  const config = { smallBlind: 50, bigBlind: bb, seatCount: 2, players: [0,1].map(seat => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, controller: "bot" as const, stack: 100 * node.situation.startingStacksBB[seat] })) };
  const waiting = engine.createGame(config);
  const probe = engine.startHand(waiting, createDeterministicDeck());
  const view = engine.decisionView(probe);
  const heroSeat = view.players.find(p => p.position === node.situation.position)!.seat;
  // startingStacks are position-relative, independent of the adapter's button assignment.
  const configured = engine.createGame({ ...config, players: config.players.map(p => ({ ...p, stack: bb * node.situation.startingStacksBB[p.seat === view.buttonSeat ? 0 : 1] })) });
  const available = createDeterministicDeck().map(c => c.rank + c.suit).filter(c => !cards.includes(c) && !opponentCards?.includes(c));
  const prefix = [0,1].flatMap(round => view.postflopOrder.map(seat => seat === heroSeat ? cards[round] : opponentCards?.[round] ?? available.shift()!));
  let state = engine.startHand(configured, createDeterministicDeck(prefix));
  const initialState = state;
  const actions: BotHandContext["actions"][number][] = [];
  for (const step of node.situation.line) {
    const before = state, v = engine.decisionView(state);
    if (v.players.find(p => p.seat === v.currentActorSeat)?.position !== step.position) throw new Error("Reference actor mismatch");
    const action = engineAction(step.action, bb);
    state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
    actions.push({ sequence: actions.length + 1, action, stateBefore: before });
  }
  const history = { version: 0, handNumber: 1, initialState, actions };
  const base = evaluationContext(state, history, "facts", samples);
  const context = { ...base, sessionStats: projectSessionStats({ gameId: "reference-empty", version: 0, currentHand: history, previousHands: [] }, state, engine.snapshot(state).currentActorId!) };
  return { state, history, context };
}
export function offlineReferenceControl(data: Reference, samples = 5) {
  const random = seededRandom(4567);
  return data.nodes.flatMap(node => handClasses.map(hand => {
    try {
      const fixture = referenceFixture(node, hand.cards, samples);
      const match = matchReference(data, fixture.state, fixture.history, fixture.context);
      if (!match.supported) return { node: node.id, hand: hand.notation, weight: hand.weight, supported: false, reason: match.reason };
      const action = sampleEntry(match.entry, fixture.context.game.bigBlind, random);
      engine.applyAction(fixture.state, engine.snapshot(fixture.state).currentActorId!, action);
      return { node: node.id, hand: hand.notation, weight: hand.weight, supported: true, action,
        score: scoreReference(match, fixture.context, action, node.opponentRange) };
    } catch { return { node: node.id, hand: hand.notation, weight: hand.weight, supported: false, reason: "fixture_engine_incompatible" }; }
  }));
}
/** Deterministic, situation-disjoint split comes from the frozen source file; never select on provider outcomes. */
export function heldOutDecisions(data: Reference, samples = 5000) {
  const result: { node: ReferenceNode; hand: typeof handClasses[number]; fixture: ReturnType<typeof referenceFixture> }[] = [];
  for (const node of data.nodes.filter(n => n.split === "held-out")) for (const hand of handClasses) {
    try {
      const fixture = referenceFixture(node, hand.cards, samples);
      const match = matchReference(data, fixture.state, fixture.history, fixture.context);
      if (match.supported && scoreReference(match, fixture.context, sampleEntry(match.entry, fixture.context.game.bigBlind, () => 0), node.opponentRange)) result.push({ node, hand, fixture });
    } catch { /* unsupported configuration; offline control records the reason */ }
  }
  // Round robin across situations, with deterministic hand-class ordering.
  result.sort((a,b) => handClasses.indexOf(a.hand) - handClasses.indexOf(b.hand) || a.node.id.localeCompare(b.node.id));
  return result.slice(0,40);
}
export interface DecisionRow { node: string; hand: string; weight: number; repetition: number; variant: "current" | "advisory"; action: PokerAction | null; failure: string | null; score: ReturnType<typeof scoreReference>; diagnostics: ReturnType<typeof sanitizedDiagnostics> | null }
export async function evaluateReferenceDecisions(data: Reference, current: PokerBot, advisory: PokerBot,
  fixtures = heldOutDecisions(data), progress: (rows: readonly DecisionRow[]) => void = () => {}, beforeDecision?: (fixture: ReturnType<typeof referenceFixture>) => void) {
  const rows: DecisionRow[] = [];
  for (const { node, hand, fixture } of fixtures) for (let repetition = 0; repetition < 3; repetition++) {
    for (const variant of repetition % 2 ? ["advisory", "current"] as const : ["current", "advisory"] as const) {
      const row: DecisionRow = { node: node.id, hand: hand.notation, weight: hand.weight, repetition, variant, action: null, failure: null, score: null, diagnostics: null };
      rows.push(row);
      try {
        beforeDecision?.(fixture);
        const decision = await (variant === "current" ? current : advisory).decide(fixture.context);
        engine.applyAction(fixture.state, engine.snapshot(fixture.state).currentActorId!, decision.action);
        row.action = decision.action;
        row.score = scoreReference(matchReference(data, fixture.state, fixture.history, fixture.context), fixture.context, decision.action, node.opponentRange);
        row.diagnostics = sanitizedDiagnostics(decision.diagnostics);
      } catch (error) { row.failure = failureCategory(error); if (error instanceof BudgetExhausted) { progress(rows); return rows; } }
      progress(rows);
    }
  }
  return rows;
}
export function decisionSummary(data: Reference, rows: readonly DecisionRow[]) {
  return data.nodes.map(node => ({ node: node.id, split: node.split, variants: (["current", "advisory"] as const).map(variant => {
    const selected = rows.filter(r => r.node === node.id && r.variant === variant);
    const graded = selected.filter(r => r.score?.regretBB !== null && r.score !== null);
    const weight = graded.reduce((sum,r) => sum + r.weight, 0);
    return { variant, attempts: selected.length, failures: selected.filter(r => r.failure).length,
      referenceRegretBB: weight ? graded.reduce((sum,r) => sum + r.score!.regretBB! * r.weight, 0) / weight : null,
      descriptive: [...new Set(selected.map(r => r.hand))].map(hand => ({ hand,
        frequencyDeviationTV: frequencyDeviation(node.hands[hand], selected.filter(r => r.hand === hand && r.action).map(r => r.action!), 100),
        supportedDecisions: selected.filter(r => r.hand === hand && r.score?.supportedAction).length })),
      interpretation: node.ev ? "conditional_on_reference_assumptions" : "descriptive_not_strength" };
  }) }));
}

/** Caller freezes the audited dataset and selected fixture checksum before using this paid seam. */
export async function runReferenceDecisions(data: Reference, client: TypesafeDecisionClient, budget: RequestBudget,
  progress: (rows: readonly DecisionRow[]) => void = () => {}, onFreeze: (metadata: { dataChecksum: string; fixtureChecksum: string }) => void = () => {}) {
  let active: ReturnType<typeof referenceFixture> | null = null;
  const variants = chartVariants(budget.client(client, "decisions"), data, context => active
    ? matchReference(data, active.state, active.history, context) : { supported: false, reason: "no_authoritative_fixture" }, seededRandom(745));
  const fixtures = heldOutDecisions(data);
  const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const frozen = { dataChecksum: digest(data), fixtureChecksum: digest(fixtures.map(({ node, hand, fixture }) => ({ node: node.id, hand: hand.notation, context: fixture.context }))) };
  onFreeze(frozen); // The caller can persist the selected inputs before the first request.
  const rows = await evaluateReferenceDecisions(data, variants.current, variants.advisory, fixtures, progress, fixture => { active = fixture; });
  return { ...frozen, dataVersion: data.dataVersion, sourceRevision: data.source.revision, selectedDecisions: fixtures.length,
    providerRequests: budget.allocations.decisions, coverage: variants.coverage, rows, summaries: decisionSummary(data, rows),
    noProviderControl: offlineReferenceControl(data) };
}
