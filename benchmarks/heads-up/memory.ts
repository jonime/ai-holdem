import { pokerEngineAdapter as engine, createDeterministicDeck } from "@/lib/poker/adapter";
import { projectSessionStats } from "@/lib/poker/session-stats";
import type { BotHandContext } from "@/lib/poker/bot-history";
import type { PokerAction, PokerGameState } from "@/lib/poker/types";
import type { BotContext, PokerBot } from "@/lib/bots/types";
import { buildPreflopNode, evaluationContext, preflopNodes } from "../poker-context-harness";
import { failureCategory, BudgetExhausted } from "./experiment";
import { actionKey } from "./reference";
import { sanitizedDiagnostics } from "../heads-up-pilot";

export const memoryFixtureVersion = "jev-memory-six-v1";
export const memorySituations = [
  { id: "button-weak", node: "HU-open", cards: ["7s", "2h"] },
  { id: "button-suited", node: "HU-open", cards: ["Js", "Ts"] },
  { id: "bb-weak", node: "HU-defend", cards: ["7s", "2h"] },
  { id: "bb-suited", node: "HU-defend", cards: ["Js", "Ts"] },
  { id: "bb-pair", node: "HU-defend", cards: ["8s", "8h"] },
  { id: "button-premium", node: "HU-open", cards: ["As", "Ks"] },
] as const;
export const historyKinds = ["folding", "calling", "insufficient"] as const;
export type HistoryKind = typeof historyKinds[number];
const configured = (state: PokerGameState) => engine.createGame({ ...state.config, players: state.config.players.map(p => ({ ...p,
  stack: 200, bot: { id: "memory-fixture", label: "Fixture", provider: "rules" as const, modelId: null }, aiDifficulty: "medium" as const })) });
/** Recorded complete hands replay through the adapter. Never invent aggregate rates. */
function histories(base: PokerGameState, heroSeat: number, kind: HistoryKind) {
  let state = configured(base);
  if (kind === "insufficient") state = engine.restore({ ...state, config: { ...state.config, players: state.config.players.map(p =>
    p.seat === heroSeat ? p : { ...p, bot: { ...p.bot!, id: "previous-opponent" } }) } });
  const hands: BotHandContext[] = [];
  for (let n = 0; n < 20; n++) {
    if (kind === "insufficient" && n === 16) state = engine.restore({ ...state, config: { ...state.config, players: state.config.players.map(p =>
      p.seat === heroSeat ? p : { ...p, bot: { ...p.bot!, id: "memory-fixture" } }) } });
    state = engine.startHand(state, createDeterministicDeck());
    const initialState = state;
    const actions: BotHandContext["actions"][number][] = [];
    while (engine.snapshot(state).street !== "complete") {
      const v = engine.decisionView(state), legal = engine.getLegalActions(state);
      const opponent = v.currentActorSeat !== heroSeat;
      const facing = legal.find(a => a.type === "call");
      let action: PokerAction;
      if (actions.length === 0) action = { type: "raise", amount: 6 };
      else if (facing?.type === "call") action = opponent && kind === "folding" ? { type: "fold" } : { type: "call", amount: facing.amount };
      else action = { type: "check" };
      const before = state;
      state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
      actions.push({ sequence: actions.length + 1, action, stateBefore: before });
      if (actions.length > 200) throw new Error("Memory fixture did not complete");
    }
    hands.push({ version: 0, handNumber: n + 1, initialState, actions, finalState: state });
  }
  return { state, hands };
}
export function memoryFixtures(samples = 5000) {
  return memorySituations.map(situation => {
    const base = buildPreflopNode(preflopNodes.find(n => n.id === situation.node)!, situation.cards, "facts", 5);
    const heroSeat = base.context.hero.seat;
    const recorded = Object.fromEntries(historyKinds.map(kind => [kind, histories(base.state, heroSeat, kind)])) as Record<HistoryKind, ReturnType<typeof histories>>;
    // A single current hand supplies identical cards/stacks/line for all contrasts.
    const probe = engine.startHand(recorded.folding.state, createDeterministicDeck());
    const order = engine.decisionView(probe).postflopOrder;
    const available = createDeterministicDeck().map(c => c.rank + c.suit).filter(c => !([ ...situation.cards ] as string[]).includes(c));
    const prefix = [0, 1].flatMap(round => order.map(seat => seat === heroSeat ? situation.cards[round] : available.shift()!));
    const current = engine.startHand(recorded.folding.state, createDeterministicDeck(prefix));
    const actions: BotHandContext["actions"][number][] = [];
    let state = current;
    while (engine.decisionView(state).currentActorSeat !== heroSeat) {
      const before = state, action: PokerAction = { type: "raise", amount: 6 };
      state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
      actions.push({ sequence: actions.length + 1, action, stateBefore: before });
    }
    const hand = { version: 0, handNumber: 21, initialState: current, actions };
    const context = evaluationContext(state, hand, "facts", samples);
    const stats = (kind: HistoryKind) => projectSessionStats({ gameId: "memory-fixture", version: 0, currentHand: hand, previousHands: recorded[kind].hands }, state, engine.snapshot(state).currentActorId!);
    const canonicalHero = stats("folding").participants.find(p => p.role === "hero")!;
    const makeContext = (kind: HistoryKind): BotContext => {
      const projected = stats(kind);
      // Intervention varies only opponent observations; fix hero aggregate history.
      return { ...context, sessionStats: { ...projected, coverage: projected.coverage,
        participants: projected.participants.map(p => p.role === "hero" ? canonicalHero : p) } };
    };
    const contexts = { folding: makeContext("folding"), calling: makeContext("calling"), insufficient: makeContext("insufficient") };
    return { id: situation.id, state, hand, contexts };
  });
}
export interface MemoryRow { situation: string; history: HistoryKind; repetition: number; statistics: "enabled" | "omitted"; action: string | null; failure: string | null; diagnostics: ReturnType<typeof sanitizedDiagnostics> | null }
export async function evaluateMemory(bot: PokerBot, fixtures = memoryFixtures(), progress: (rows: readonly MemoryRow[]) => void = () => {}) {
  const rows: MemoryRow[] = [];
  for (const fixture of fixtures) for (let repetition = 0; repetition < 3; repetition++) for (const history of historyKinds) {
    // Counterbalance order; compare distributions, not paired stochastic changes.
    for (const statistics of repetition % 2 ? ["omitted", "enabled"] as const : ["enabled", "omitted"] as const) {
      const { sessionStats, ...omitted } = fixture.contexts[history]; void sessionStats;
      const context = statistics === "enabled" ? fixture.contexts[history] : omitted;
      const row: MemoryRow = { situation: fixture.id, history, repetition, statistics, action: null, failure: null, diagnostics: null };
      rows.push(row);
      try {
        const decision = await bot.decide(context);
        engine.applyAction(fixture.state, engine.snapshot(fixture.state).currentActorId!, decision.action);
        row.action = actionKey(decision.action); row.diagnostics = sanitizedDiagnostics(decision.diagnostics);
      } catch (error) { row.failure = failureCategory(error); if (error instanceof BudgetExhausted) { progress(rows); return rows; } }
      progress(rows);
    }
  }
  return rows;
}
export function summarizeMemory(rows: readonly MemoryRow[]) {
  return memorySituations.map(({ id }) => {
    const groups = historyKinds.flatMap(history => (["enabled", "omitted"] as const).map(statistics => {
      const group = rows.filter(r => r.situation === id && r.history === history && r.statistics === statistics);
      const successes = group.filter(r => r.action !== null);
      return { history, statistics, attempts: group.length, failures: group.filter(r => r.failure).length,
        frequencies: Object.fromEntries([...new Set(successes.map(r => r.action!))].map(a => [a, successes.filter(r => r.action === a).length / successes.length])) };
    }));
    const distance = (a: Record<string, number>, b: Record<string, number>) => [...new Set([...Object.keys(a), ...Object.keys(b)])].reduce((sum, k) => sum + Math.abs((a[k] ?? 0) - (b[k] ?? 0)), 0) / 2;
    return { situation: id, groups, foldingCallingTV: Object.fromEntries((["enabled", "omitted"] as const).map(statistics => {
      const a = groups.find(g => g.history === "folding" && g.statistics === statistics)!;
      const b = groups.find(g => g.history === "calling" && g.statistics === statistics)!;
      return [statistics, a.attempts > a.failures && b.attempts > b.failures ? distance(a.frequencies, b.frequencies) : null];
    })), interpretation: "behavioral_sensitivity_only_no_independent_quality_reference" };
  });
}
