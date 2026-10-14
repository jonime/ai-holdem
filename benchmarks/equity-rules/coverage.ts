import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import type { BotHandContext } from "@/lib/poker/bot-history";
import type { PokerAction } from "@/lib/poker/types";
import { buildPreflopNode, preflopNodes } from "../poker-context-harness";
import { scenarios } from "../scenarios/harness";
import { calculateRangeEquity } from "../range-equity/calculator";
import { fixtures as rangeFixtures } from "../range-equity/fixtures";
import { ExperimentalRulesBot, structuredDecision, variants } from "./challenger";
import { rulesContext } from "./context";
import { difficulties } from "./experiment";

export function replayScenario(scenario: typeof scenarios[number]) {
  let state = engine.startHand(engine.createGame({ smallBlind: 1, bigBlind: 2,
    players: scenario.stacks.map((stack, seat) => ({ id: `seat-${seat}`, name: `Seat ${seat}`, seat, stack, controller: "bot" })) }),
    createDeterministicDeck(scenario.deck));
  const initialState = state, actions: BotHandContext["actions"][number][] = [];
  for (const step of scenario.actions) {
    if (engine.snapshot(state).currentActorId !== `seat-${step.seat}`) throw new Error("Unexpected fixture actor");
    const before = state; state = engine.applyAction(state, `seat-${step.seat}`, step.action);
    actions.push({ sequence: actions.length + 1, action: step.action, stateBefore: before });
  }
  return { state, history: { version: 0, handNumber: 1, initialState, actions } };
}
export async function fixedCoverage(samples = 100) {
  const rows: { id: string; difficulty: string; variant: string; action: PokerAction; stage: string | null; seats: number;
    historyStatus: string; position: string; street: string; potType: string | undefined; stackBB: number }[] = [];
  const evaluate = async (id: string, fixture: ReturnType<typeof replayScenario>, unknownHistory = false) => {
    for (const difficulty of difficulties) for (const variant of variants) {
      const context = rulesContext(fixture.state, unknownHistory ? null : fixture.history, variant, difficulty, samples);
      const result = await new ExperimentalRulesBot(variant).decide(context);
      engine.applyAction(fixture.state, engine.snapshot(fixture.state).currentActorId!, result.action);
      rows.push({ id, difficulty, variant, action: result.action, stage: result.diagnostics.matchedRule, seats: context.opponents.length + 1,
        historyStatus: context.situation?.historyStatus ?? "unknown", position: context.hero.position, street: context.hand.street, potType: context.situation?.preflop, stackBB: context.hero.stack / 2 });
    }
  };
  for (const scenario of scenarios) {
    const fixture = replayScenario(scenario);
    await evaluate(scenario.id, fixture);
    await evaluate(`${scenario.id}-unknown-history`, fixture, true);
  }
  // Position/pot-type/depth coverage uses replayed authoritative preflop actions.
  for (const node of preflopNodes) for (const stackBB of [20, 150]) for (const cards of [["As", "Ah"], ["Kh", "Qh"], ["7s", "2h"]]) {
    const fixture = buildPreflopNode(node, cards, "facts", samples, { stackBB });
    await evaluate(`${node.id}-${stackBB}-${cards.join("")}`, fixture);
  }
  // 3/4/5-player fixed decisions across every seat and street, with made hands and genuine draws.
  for (const seats of [3, 4, 5]) for (let hero = 0; hero < seats; hero++) for (const stack of [40, 300]) {
    for (const [kind, hole, board] of [
      ["made", ["Ah", "Qd"], ["Ac", "8s", "3h", "4d", "6s"]],
      ["draw", ["Kh", "Jh"], ["9h", "4h", "2s", "7c", "8d"]],
      ["board-strength", ["7d", "2h"], ["As", "Ac", "Ad", "Ah", "Ks"]],
    ] as const) {
      const pool = createDeterministicDeck().map(c => c.rank + c.suit).filter(c => !(hole as readonly string[]).includes(c) && !(board as readonly string[]).includes(c));
      const prefix: string[] = [];
      for (let round = 0; round < 2; round++) for (let offset = 1; offset <= seats; offset++)
        prefix.push(offset % seats === hero ? hole[round] : pool.shift()!);
      prefix.push(pool.shift()!, ...board.slice(0, 3), pool.shift()!, board[3], pool.shift()!, board[4]);
      let state = engine.startHand(engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: seats,
        players: Array.from({ length: seats }, (_, seat) => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, stack, controller: "bot" })) }), createDeterministicDeck(prefix));
      const initialState = state, actions: BotHandContext["actions"][number][] = [];
      const visited = new Set<string>(), pressured = new Set<string>();
      for (let n = 0; n < 100 && engine.snapshot(state).street !== "complete"; n++) {
        const snapshot = engine.snapshot(state), actor = snapshot.currentActorId!;
        if (actor === `p${hero}` && !visited.has(snapshot.street!)) {
          visited.add(snapshot.street!);
          await evaluate(`${seats}-${hero}-${stack}-${kind}-${snapshot.street}`, { state, history: { version: 0, handNumber: 1, initialState, actions } });
        }
        const legal = engine.getLegalActions(state);
        const aggression = legal.find(a => a.type === "bet" || a.type === "raise");
        let action: PokerAction;
        if (actor !== `p${hero}` && aggression && !pressured.has(snapshot.street!)) {
          pressured.add(snapshot.street!); action = { type: aggression.type, amount: aggression.minAmount };
        } else {
          const call = legal.find(a => a.type === "call");
          action = legal.some(a => a.type === "check") ? { type: "check" } : call ? { type: "call", amount: call.amount } : { type: "fold" };
        }
        const before = state; state = engine.applyAction(state, actor, action);
        actions.push({ sequence: actions.length + 1, action, stateBefore: before });
      }
    }
  }
  return { equitySamples: samples, fallbackCoverage: variants.map(variant => {
    const selected = rows.filter(row => row.variant === variant);
    return { variant, decisions: selected.length, unknownHistory: selected.filter(row => row.historyStatus === "unknown").length,
      fallbacks: selected.filter(row => row.stage?.startsWith("fallback:")).length };
  }), rows };
}

/** Controlled heads-up decisions only. Ranges are explicit sensitivity hypotheses, never inferred. */
export function rangeSensitivity(samples = 5000) {
  return rangeFixtures.filter(f => f.input.opponents.length === 1).flatMap(fixture => {
    const base = rangeDecisionFixture(fixture.input.hero, fixture.input.board);
    const reference = rulesContext(base.state, base.history, "structured", "medium", samples);
    const randomEquity = reference.analysis.showdownEquity;
    const result = calculateRangeEquity({ ...fixture.input, sampleBudget: samples });
    return difficulties.map(difficulty => {
      const context = { ...reference, difficulty };
      return { id: fixture.id, difficulty, geometry: { street: context.hand.street, pot: context.hand.pot,
        callCost: context.analysis.callCost, contestablePotAfterCall: context.analysis.contestablePotAfterCall },
        randomEquity, range: result, randomDecision: structuredDecision(context).action,
        rangeDecision: result.status === "supported" ? structuredDecision(context, result.showdownShare).action : null };
    });
  });
}

function rangeDecisionFixture(hole: readonly string[], board: readonly string[]) {
  const pool = createDeterministicDeck().map(c => c.rank + c.suit).filter(c => !hole.includes(c) && !board.includes(c));
  const prefix = [pool.shift()!, hole[0], pool.shift()!, hole[1]];
  if (board.length) prefix.push(pool.shift()!, ...board.slice(0, 3));
  if (board.length >= 4) prefix.push(pool.shift()!, board[3]);
  if (board.length === 5) prefix.push(pool.shift()!, board[4]);
  let state = engine.startHand(engine.createGame({ smallBlind: 1, bigBlind: 2,
    players: [0, 1].map(seat => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, stack: 200, controller: "bot" })) }), createDeterministicDeck(prefix));
  const initialState = state, actions: BotHandContext["actions"][number][] = [];
  const target = board.length === 0 ? "preflop" : board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river";
  while (engine.snapshot(state).street !== target) {
    const actor = engine.snapshot(state).currentActorId!, legal = engine.getLegalActions(state);
    const call = legal.find(a => a.type === "call");
    const action: PokerAction = legal.some(a => a.type === "check") ? { type: "check" } : { type: "call", amount: call!.amount };
    const before = state; state = engine.applyAction(state, actor, action);
    actions.push({ sequence: actions.length + 1, action, stateBefore: before });
  }
  if (target !== "preflop") {
    const before = state, action: PokerAction = { type: "bet", amount: 4 };
    state = engine.applyAction(state, "p1", action);
    actions.push({ sequence: actions.length + 1, action, stateBefore: before });
  }
  return { state, history: { version: 0, handNumber: 1, initialState, actions } };
}
