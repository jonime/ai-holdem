import legalActionExpectations from "./legal-actions.json";
import { everydayScenarios } from "./everyday";
import { legacyDecisionHistory, projectBotHistory, type BotHandContext } from "@/lib/poker/bot-history";
import type { BotContext, PokerBot } from "@/lib/bots/types";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { createPokerAIState } from "@/lib/poker/ai-state";
import type { AIDifficulty, PokerAction } from "@/lib/poker/types";
import { createSizingOptions, createLegacySizingOptions } from "@/lib/typesafe/questions";

interface RiverScenario {
  readonly id: string;
  readonly reason: string;
  /** Deck prefix: seat 1, seat 0, seat 1, seat 0, burn, flop, burn, turn, burn, river. */
  readonly deck: readonly string[];
  readonly riverAction: "check" | "bet" | "shove";
  readonly showdown: "win" | "split" | "lose";
  readonly forbidden: readonly PokerAction["type"][];
}

const nuts = ["9c", "As", "9d", "Ks", "2c", "Qs", "Js", "Ts", "3c", "4d", "5c", "7h"];
export const riverScenarios: readonly RiverScenario[] = [
  {
    id: "free-check",
    reason: "Checking costs nothing and preserves the chance to win; folding gives it up.",
    deck: ["Ac", "7s", "Ad", "2h", "3c", "Kd", "9s", "4h", "5c", "Jc", "6c", "Qd"],
    riverAction: "check",
    showdown: "lose",
    forbidden: ["fold"],
  },
  {
    id: "royal-flush-facing-bet",
    reason: "Hero holds the exclusive royal flush on the river and cannot lose. Never fold.",
    deck: nuts,
    riverAction: "bet",
    showdown: "win",
    forbidden: ["fold"],
  },
  {
    id: "royal-flush-facing-all-in",
    reason: "Even an all-in cannot justify folding the exclusive river nuts.",
    deck: nuts,
    riverAction: "shove",
    showdown: "win",
    forbidden: ["fold"],
  },
  {
    id: "royal-board-facing-all-in",
    reason: "The board is a royal flush: calling guarantees a split and recovers the existing investment (no rake).",
    deck: ["9c", "7d", "9d", "2h", "3c", "As", "Ks", "Qs", "4c", "Js", "5c", "Ts"],
    riverAction: "shove",
    showdown: "split",
    forbidden: ["fold"],
  },
  {
    id: "quads-facing-all-in",
    reason: "Four aces cannot lose on this unconnected river board.",
    deck: ["Kc", "As", "Kd", "Ah", "2c", "Ac", "Ad", "7s", "3c", "4d", "5c", "9h"],
    riverAction: "shove",
    showdown: "win",
    forbidden: ["fold"],
  },
  {
    id: "broadway-board-facing-all-in",
    reason: "The rainbow broadway board guarantees a split; no flush is possible.",
    deck: ["9c", "7d", "9d", "2h", "3c", "As", "Kh", "Qd", "4c", "Jc", "5c", "Ts"],
    riverAction: "shove",
    showdown: "split",
    forbidden: ["fold"],
  },
  {
    id: "royal-board-facing-small-bet",
    reason: "Call the guaranteed split; raising cannot win more chips on a royal board.",
    deck: ["9c", "7d", "9d", "2h", "3c", "As", "Ks", "Qs", "4c", "Js", "5c", "Ts"],
    riverAction: "bet",
    showdown: "split",
    forbidden: ["fold", "raise"],
  },
  {
    id: "board-quads-low-kicker-facing-all-in",
    reason: "Hero plays four twos with the board's three kicker: every possible opponent holding wins or ties, so an enormous call is unjustified.",
    deck: ["Ac", "3d", "Kd", "3h", "4c", "2s", "2h", "2d", "5c", "2c", "6c", "3s"],
    riverAction: "shove",
    showdown: "lose",
    forbidden: ["call", "raise"],
  },
];

export interface Scenario {
  readonly id: string;
  readonly reason: string;
  readonly deck: readonly string[];
  readonly stacks: readonly number[];
  readonly actions: readonly { seat: number; action: PokerAction }[];
  readonly hero: number;
  readonly expected: {
    street: "preflop" | "flop" | "turn" | "river";
    stacks: readonly number[];
    pot: number;
    legal: readonly string[];
    hole: readonly string[];
    board: readonly string[];
    callCost?: number;
    contestablePotAfterCall?: number;
  };
  readonly forbidden: readonly PokerAction["type"][];
  readonly observation?: string;
}

export const scenarios: readonly Scenario[] = [
  ...riverScenarios.map((river): Scenario => ({
    ...river, stacks: [200, 200], hero: 0,
    actions: [
      { seat: 0, action: { type: "call", amount: 1 } },
      ...[1, 1, 0, 1, 0].map(seat => ({ seat, action: { type: "check" as const } })),
      { seat: 1, action: river.riverAction === "check" ? { type: "check" } : { type: "bet", amount: river.riverAction === "shove" ? 198 : 2 } },
    ],
    expected: { street: "river", stacks: [198, river.riverAction === "shove" ? 0 : river.riverAction === "bet" ? 196 : 198],
      pot: river.riverAction === "shove" ? 202 : river.riverAction === "bet" ? 6 : 4,
      legal: river.riverAction === "check" ? ["fold", "check", "bet"] : river.riverAction === "shove" ? ["fold", "call"] : ["fold", "call", "raise"],
      hole: [river.deck[1], river.deck[3]], board: [river.deck[5], river.deck[6], river.deck[7], river.deck[9], river.deck[11]] },
  })),
  ...everydayScenarios,
];

/** Replay explicit legal transitions through the same adapter as production. */
export function buildScenario(scenario: Scenario, options: {
  difficulty?: AIDifficulty;
  typesafePolicyV2?: boolean;
  provider?: "rules" | "typesafe" | "eevo" | "llm";
} = {}) {
  if (scenario.stacks.length < 2 || scenario.stacks.length > 6) throw new Error("Expected 2–6 seats");
  let state = engine.startHand(engine.createGame({
    smallBlind: 1, bigBlind: 2,
    players: scenario.stacks.map((stack, seat) => ({
      id: `seat-${seat}`, name: `Seat ${seat}`, controller: "bot" as const, seat, stack,
    })),
  }), createDeterministicDeck(scenario.deck));
  const initialState = state;
  const history: BotHandContext["actions"][number][] = [];
  for (const step of scenario.actions) {
    if (engine.snapshot(state).currentActorId !== `seat-${step.seat}`) throw new Error(`${scenario.id}: unexpected replay actor`);
    const before = state;
    state = engine.applyAction(state, `seat-${step.seat}`, step.action);
    history.push({ sequence: history.length + 1, action: step.action, stateBefore: before });
  }
  const heroId = engine.snapshot(state).currentActorId;
  if (heroId !== `seat-${scenario.hero}`) throw new Error("Unexpected scenario hero");
  const projected=projectBotHistory({ version:0,handNumber:engine.snapshot(state).handNumber,initialState,actions:history },state,heroId);
  const provider = options.provider ?? (options.typesafePolicyV2 ? "typesafe" : "rules");
  const aiState = createPokerAIState(state, heroId, {
    difficulty: options.difficulty,
    correctedContext: provider !== "rules",
    decisionHistory: provider === "rules" ? legacyDecisionHistory(projected.actions) : projected.actions,
    historyStatus: projected.status,
  });
  const context: BotContext = { ...aiState, sizingOptions: provider === "rules" ? createLegacySizingOptions(aiState) : createSizingOptions(aiState) };
  const legalExpected = Object.entries(legalActionExpectations).find(([id]) => id === scenario.id)?.[1];
  if (!legalExpected) throw new Error(`${scenario.id}: missing legal action bounds`);
  if (JSON.stringify(context.legalActions) !== JSON.stringify(legalExpected)) throw new Error(`${scenario.id}: legal action bounds differ`);
  const view = engine.decisionView(state)!;
  const actual = { street: view.street, stacks: view.players.map(p => p.stack), pot: view.pot,
    legal: context.legalActions.map(a => a.type), hole: context.hero.holeCards, board: view.communityCards };
  for (const key of ["street", "stacks", "pot", "legal", "hole", "board"] as const) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(scenario.expected[key])) throw new Error(`${scenario.id}: ${key}: ${JSON.stringify(actual[key])}`);
  }
  for (const key of ["callCost", "contestablePotAfterCall"] as const) {
    if (scenario.expected[key] !== undefined && context.analysis[key] !== scenario.expected[key]) throw new Error(`${scenario.id}: ${key}: ${context.analysis[key]}`);
  }
  return { state, heroId, context };
}

export function gradeAction(scenario: Scenario, fixture: ReturnType<typeof buildScenario>, action: PokerAction) {
  try {
    engine.applyAction(fixture.state, fixture.heroId, action);
  } catch {
    return { status: "illegal" as const, reason: "Engine rejected the proposed action" };
  }
  return scenario.forbidden.includes(action.type)
    ? { status: "blunder" as const, reason: scenario.reason }
    : { status: "pass" as const, reason: scenario.reason };
}

export async function evaluateScenario(bot: PokerBot, scenario: Scenario, options: Parameters<typeof buildScenario>[1] = {}) {
  const fixture = buildScenario(scenario, options);
  const started = performance.now();
  try {
    const decision = await bot.decide(structuredClone(fixture.context));
    return { scenario: scenario.id, ...gradeAction(scenario, fixture, decision.action),
      action: decision.action, matchedRule: decision.diagnostics.matchedRule, sizing: decision.diagnostics.sizing?.choice ?? null, observation: scenario.observation ?? null, context: fixture.context, durationMs: Math.round(performance.now() - started) };
  } catch {
    // Do not print provider exceptions or raw responses: they may contain credentials or private data.
    return { scenario: scenario.id, status: "provider-error" as const,
      reason: "Provider failed to return a decision; check credentials, availability, or response validation",
      action: null, context: fixture.context, durationMs: Math.round(performance.now() - started) };
  }
}
