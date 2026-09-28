import type { BotContext, PokerBot } from "@/lib/bots/types";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { createPokerAIState, type PokerAIActionHistoryItem } from "@/lib/poker/ai-state";
import type { AIDifficulty, PokerAction } from "@/lib/poker/types";
import { createSizingOptions } from "@/lib/typesafe/questions";

export interface Scenario {
  readonly id: string;
  readonly reason: string;
  /** Deck prefix: seat 1, seat 0, seat 1, seat 0, burn, flop, burn, turn, burn, river. */
  readonly deck: readonly string[];
  readonly riverAction: "check" | "bet" | "shove";
  readonly forbidden: readonly PokerAction["type"][];
}

const nuts = ["9c", "As", "9d", "Ks", "2c", "Qs", "Js", "Ts", "3c", "4d", "5c", "7h"];
export const scenarios: readonly Scenario[] = [
  {
    id: "free-check",
    reason: "Checking costs nothing and preserves the chance to win; folding gives it up.",
    deck: ["Ac", "7s", "Ad", "2h", "3c", "Kd", "9s", "4h", "5c", "Jc", "6c", "Qd"],
    riverAction: "check",
    forbidden: ["fold"],
  },
  {
    id: "royal-flush-facing-bet",
    reason: "Hero holds the exclusive royal flush on the river and cannot lose. Never fold.",
    deck: nuts,
    riverAction: "bet",
    forbidden: ["fold"],
  },
  {
    id: "royal-flush-facing-all-in",
    reason: "Even an all-in cannot justify folding the exclusive river nuts.",
    deck: nuts,
    riverAction: "shove",
    forbidden: ["fold"],
  },
  {
    id: "royal-board-facing-all-in",
    reason: "The board is a royal flush: calling guarantees a split and recovers the existing investment (no rake).",
    deck: ["9c", "7d", "9d", "2h", "3c", "As", "Ks", "Qs", "4c", "Js", "5c", "Ts"],
    riverAction: "shove",
    forbidden: ["fold"],
  },
];

/** Replay actual engine transitions; never fabricate pots, legal actions, or equity. */
export function buildScenario(scenario: Scenario, options: {
  difficulty?: AIDifficulty;
  typesafePolicyV2?: boolean;
} = {}) {
  let state = engine.startHand(engine.createGame({
    smallBlind: 1,
    bigBlind: 2,
    players: [0, 1].map((seat) => ({
      id: `seat-${seat}`, name: `Seat ${seat}`, controller: "bot" as const, seat, stack: 200,
    })),
  }), createDeterministicDeck(scenario.deck));
  const history: PokerAIActionHistoryItem[] = [];
  function act(action: PokerAction) {
    const snapshot = engine.snapshot(state);
    if (!snapshot.currentActorId || !snapshot.street || snapshot.street === "complete") {
      throw new Error("Scenario ended before its decision point");
    }
    const player = state.config.players.find((entry) => entry.id === snapshot.currentActorId)!;
    state = engine.applyAction(state, player.id, action);
    history.push({ sequence: history.length + 1, street: snapshot.street,
      action: action.type, amount: "amount" in action ? action.amount ?? null : null,
      player: player.name, controller: "bot" });
  }
  for (let step = 0; engine.snapshot(state).street !== "river"; step++) {
    if (step >= 12) throw new Error("Could not reach scenario river");
    const action = engine.getLegalActions(state).find((entry) => entry.type === "check" || entry.type === "call");
    if (!action || (action.type !== "check" && action.type !== "call")) throw new Error("Cannot passively reach river");
    act(action);
  }
  if (scenario.riverAction === "check") act({ type: "check" });
  else {
    const bet = engine.getLegalActions(state).find((entry) => entry.type === "bet");
    if (!bet || bet.type !== "bet") throw new Error("Expected river bet");
    act({ type: "bet", amount: scenario.riverAction === "shove" ? bet.maxAmount : 2 });
  }
  const heroId = engine.snapshot(state).currentActorId;
  if (heroId !== "seat-0") throw new Error("Unexpected scenario hero");
  const aiState = createPokerAIState(state, heroId, { ...options, actionHistory: history, equitySamples: 500 });
  const context: BotContext = { ...aiState, sizingOptions: createSizingOptions(aiState) };
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
      action: decision.action, context: fixture.context, durationMs: Math.round(performance.now() - started) };
  } catch {
    // Do not print provider exceptions or raw responses: they may contain credentials or private data.
    return { scenario: scenario.id, status: "provider-error" as const,
      reason: "Provider failed to return a decision; check credentials, availability, or response validation",
      action: null, context: fixture.context, durationMs: Math.round(performance.now() - started) };
  }
}
