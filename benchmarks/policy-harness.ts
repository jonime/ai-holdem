import { createDeck, type Card, type TableState } from "@hivetech/poker-engine";

import { BasicEquityBot } from "@/lib/bots/basic-equity";
import type { BotContext } from "@/lib/bots/types";
import { createPokerAIState, type PokerAIActionHistoryItem } from "@/lib/poker/ai-state";
import { pokerEngineAdapter } from "@/lib/poker/adapter";
import type { PokerAction, PokerGameState } from "@/lib/poker/types";
import { createMoveOptions, createSizingOptions } from "@/lib/typesafe/questions";

export interface BenchmarkPolicy {
  readonly name: string;
  decide(context: BotContext, random: () => number): Promise<PokerAction> | PokerAction;
}

export interface BenchmarkReport {
  readonly policy: string;
  readonly opponent: string;
  readonly hands: number;
  readonly bbPer100: number;
  readonly confidence95: readonly [number, number];
  readonly actionFrequencies: Readonly<Record<string, number>>;
  readonly failures: number;
  readonly latencyMs: {
    readonly mean: number;
    readonly p95: number;
  };
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function shuffledDeck(seed: number): readonly Card[] {
  const random = seededRandom(seed);
  const deck = [...createDeck()];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [deck[index], deck[target]] = [deck[target], deck[index]];
  }
  return deck;
}

function passive(context: BotContext): PokerAction {
  const check = context.legalActions.find((action) => action.type === "check");
  if (check) return check;
  const call = context.legalActions.find((action) => action.type === "call");
  if (call?.type === "call") return { type: "call", amount: call.amount };
  return { type: "fold" };
}

export const scriptedPassivePolicy: BenchmarkPolicy = {
  name: "scripted-passive",
  decide: passive,
};

export const scriptedAggressivePolicy: BenchmarkPolicy = {
  name: "scripted-aggressive",
  decide(context) {
    const aggressive = context.legalActions.find(
      (action) => action.type === "bet" || action.type === "raise",
    );
    if (aggressive?.type === "bet" || aggressive?.type === "raise") {
      return { type: aggressive.type, amount: aggressive.minAmount };
    }
    return passive(context);
  },
};

const basicBot = new BasicEquityBot();
export const rulesPolicy: BenchmarkPolicy = {
  name: "basic-equity-v1",
  async decide(context) {
    return (await basicBot.decide(context)).action;
  },
};

function closestHalfPot(
  context: BotContext,
): Extract<PokerAction, { type: "bet" | "raise" }> | null {
  const aggressive = context.legalActions.find(
    (action) => action.type === "bet" || action.type === "raise",
  );
  if (aggressive?.type !== "bet" && aggressive?.type !== "raise") return null;
  const sized = context.sizingOptions.filter(
    (option): option is typeof option & { amount: number } => option.amount !== null,
  );
  const target =
    aggressive.type === "raise"
      ? context.hero.investedThisStreet +
        context.hero.amountToCall +
        Math.round((context.hand.pot + context.hero.amountToCall) / 2)
      : context.hero.investedThisStreet + Math.round(context.hand.pot / 2);
  const selected = [...sized].sort(
    (left, right) =>
      Math.abs(left.amount - target) - Math.abs(right.amount - target) ||
      left.amount - right.amount,
  )[0];
  return selected ? { type: aggressive.type, amount: selected.amount } : null;
}

/** Frozen deterministic surrogate for the former two-question policy. */
export const frozenPolicyV1: BenchmarkPolicy = {
  name: "typesafe-poker-v1-mocked",
  decide(context, random) {
    const aggressive = closestHalfPot(context);
    if (aggressive && context.analysis.showdownEquity >= 0.62) return aggressive;
    const check = context.legalActions.find((action) => action.type === "check");
    const fold = context.legalActions.find((action) => action.type === "fold");
    // The frozen policy samples action probabilities and can therefore make the
    // known free-check mistake even when check was the model's top answer.
    if (check && fold && context.analysis.showdownEquity < 0.4 && random() < 0.2) {
      return fold;
    }
    if (check) return check;
    const call = context.legalActions.find((action) => action.type === "call");
    if (
      call?.type === "call" &&
      context.analysis.showdownEquity >= context.analysis.potOddsToCall + 0.03
    ) {
      return { type: "call", amount: call.amount };
    }
    return { type: "fold" };
  },
};

/** Deterministic mocked selector exercising the upgraded exact-move policy. */
export const upgradedPolicyV2: BenchmarkPolicy = {
  name: "typesafe-poker-v2-mocked",
  decide(context) {
    const moves = createMoveOptions(context);
    const aggressive = closestHalfPot(context);
    if (aggressive && context.analysis.showdownEquity >= 0.62) {
      return (
        moves.find(
          (move) =>
            move.action.type === aggressive.type &&
            "amount" in move.action &&
            move.action.amount === aggressive.amount,
        )?.action ?? aggressive
      );
    }
    const check = moves.find((move) => move.action.type === "check");
    if (check) return check.action;
    const call = moves.find((move) => move.action.type === "call");
    if (
      call &&
      context.analysis.showdownEquity >= context.analysis.potOddsToCall + 0.03
    ) {
      return call.action;
    }
    return moves.find((move) => move.action.type === "fold")?.action ?? moves[0].action;
  },
};

function tableState(state: PokerGameState): TableState {
  return state.engineState as TableState;
}

async function playHand(
  subject: BenchmarkPolicy,
  opponent: BenchmarkPolicy,
  subjectSeat: 0 | 1,
  seed: number,
): Promise<{
  readonly profitBigBlinds: number;
  readonly actions: readonly string[];
  readonly latencies: readonly number[];
}> {
  const bigBlind = 2;
  const startingStack = 200;
  const players = [subjectSeat === 0 ? subject : opponent, subjectSeat === 1 ? subject : opponent];
  let state = pokerEngineAdapter.startHand(
    pokerEngineAdapter.createGame({
      smallBlind: 1,
      bigBlind,
      players: players.map((policy, seat) => ({
        id: `seat-${seat}`,
        name: policy.name,
        controller: "bot" as const,
        seat,
        stack: startingStack,
      })),
    }),
    shuffledDeck(seed),
  );
  const history: PokerAIActionHistoryItem[] = [];
  const subjectActions: string[] = [];
  const subjectLatencies: number[] = [];
  const random = seededRandom(seed ^ 0xa5a5_a5a5);

  for (let sequence = 1; sequence <= 100; sequence += 1) {
    const snapshot = pokerEngineAdapter.snapshot(state);
    if (snapshot.street === "complete") break;
    const actorId = snapshot.currentActorId;
    if (!actorId || !snapshot.street) throw new Error("Missing benchmark actor");
    const seat = Number(actorId.slice("seat-".length));
    const aiState = createPokerAIState(state, actorId, {
      difficulty: "medium",
      equitySamples: 100,
      actionHistory: history,
      typesafePolicyV2: players[seat].name.startsWith("typesafe-poker-v2"),
    });
    const context: BotContext = {
      ...aiState,
      sizingOptions: createSizingOptions(aiState),
    };
    const started = performance.now();
    const action = await players[seat].decide(context, random);
    const duration = performance.now() - started;
    state = pokerEngineAdapter.applyAction(state, actorId, action);
    history.push({
      sequence,
      street: snapshot.street,
      action: action.type,
      amount: "amount" in action ? (action.amount ?? null) : null,
      player: players[seat].name,
      controller: "bot",
    });
    if (seat === subjectSeat) {
      subjectActions.push(action.type);
      subjectLatencies.push(duration);
    }
  }

  if (pokerEngineAdapter.snapshot(state).street !== "complete") {
    throw new Error("Benchmark hand exceeded 100 actions");
  }
  const endingStack = tableState(state).seats[subjectSeat]?.stack;
  if (endingStack === undefined || endingStack === null) {
    throw new Error("Benchmark subject left its seat");
  }
  return {
    profitBigBlinds: (endingStack - startingStack) / bigBlind,
    actions: subjectActions,
    latencies: subjectLatencies,
  };
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function confidenceInterval(
  values: readonly number[],
): readonly [number, number] {
  if (values.length < 2) return [0, 0];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length) * 100;
  const bbPer100 = mean * 100;
  return [bbPer100 - margin, bbPer100 + margin];
}

export async function runMatchup(
  subject: BenchmarkPolicy,
  opponent: BenchmarkPolicy,
  seedCount = 20,
): Promise<BenchmarkReport> {
  const profits: number[] = [];
  const actions: string[] = [];
  const latencies: number[] = [];
  let failures = 0;
  for (let seed = 1; seed <= seedCount; seed += 1) {
    for (const subjectSeat of [0, 1] as const) {
      try {
        const result = await playHand(subject, opponent, subjectSeat, seed);
        profits.push(result.profitBigBlinds);
        actions.push(...result.actions);
        latencies.push(...result.latencies);
      } catch {
        failures += 1;
      }
    }
  }
  const actionCounts = actions.reduce<Record<string, number>>((counts, action) => {
    counts[action] = (counts[action] ?? 0) + 1;
    return counts;
  }, {});
  const meanProfit = profits.length
    ? profits.reduce((sum, value) => sum + value, 0) / profits.length
    : 0;
  return {
    policy: subject.name,
    opponent: opponent.name,
    hands: profits.length,
    bbPer100: meanProfit * 100,
    confidence95: confidenceInterval(profits),
    actionFrequencies: Object.fromEntries(
      Object.entries(actionCounts).map(([action, count]) => [
        action,
        count / Math.max(1, actions.length),
      ]),
    ),
    failures,
    latencyMs: {
      mean: latencies.length
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : 0,
      p95: percentile(latencies, 0.95),
    },
  };
}
