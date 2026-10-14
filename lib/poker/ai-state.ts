import { pokerEngineAdapter, type PokerPosition } from "./adapter";
import type {
  LegalAction,
  PlayerController,
  PokerGameState,
  PokerHandStrength,
  PokerStreet,
} from "./types";
import type { AIDifficulty } from "./types";
import { calculateShowdownEquity } from "./equity";

export interface PokerAIActionHistoryItem {
  readonly sequence: number;
  readonly street: Exclude<PokerStreet, "complete">;
  readonly action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  readonly amount: number | null;
  readonly player: string;
  readonly controller: "human" | "bot";
}

export interface PokerAIDecisionHistoryItem {
  readonly sequence: number;
  readonly street: Exclude<PokerStreet, "complete">;
  readonly action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  readonly amount: number | null;
  readonly actorSeat: number | null;
  readonly actor: "hero" | "opponent" | "unknown";
  readonly controller: PlayerController;
  readonly payment?: number;
  readonly commitment?: number;
  readonly potBefore?: number;
  readonly potAfter?: number;
  readonly raiseIncrement?: number;
  readonly pressureRatio?: number;
  readonly activeSeats?: readonly number[];
}

export interface CreatePokerAIStateOptions {
  readonly actionHistory?: readonly PokerAIActionHistoryItem[];
  readonly difficulty?: AIDifficulty;
  readonly equitySamples?: number;
  /** Compatibility option for existing fixtures; providers use correctedContext. */
  readonly typesafePolicyV2?: boolean;
  readonly correctedContext?: boolean;
  readonly decisionHistory?: readonly PokerAIDecisionHistoryItem[];
  readonly historyStatus?: "complete" | "unknown";
}

export interface PokerAIState {
  readonly sessionStats?: import("./session-stats").BotSessionStats;
  readonly strategyAdvice?: import("./strategy-advice").PokerStrategyAdvice;
  readonly facts?: import("./decision-facts").PokerDecisionFacts;
  readonly situation?: {
    readonly historyStatus: "complete" | "unknown";
    readonly preflop: "unopened" | "limped" | "raised" | "re-raised" | "unknown";
    readonly dealtPlayerCount?: number;
    readonly playersRemaining?: number;
    readonly activeOpponentCount: number;
    readonly playersStillToAct: readonly number[];
    readonly postflopPosition: "in_position" | "out_of_position" | "between";
    readonly buttonIsSmallBlind: boolean;
    readonly preflopOrder: readonly number[];
    readonly postflopOrder: readonly number[];
    readonly effectiveStacks: readonly { readonly seat: number; readonly stack: number }[];
  };
  readonly difficulty: AIDifficulty;
  readonly game: {
    readonly variant: "no_limit_texas_holdem";
    readonly smallBlind: number;
    readonly bigBlind: number;
    readonly handNumber: number;
  };
  readonly hand: {
    readonly street: Exclude<PokerStreet, "complete">;
    readonly pot: number;
    readonly communityCards: readonly string[];
  };
  readonly hero: {
    readonly seat: number;
    readonly controller: PlayerController;
    readonly holeCards: readonly string[];
    readonly position: PokerPosition;
    readonly stack: number;
    readonly investedThisStreet: number;
    readonly amountToCall: number;
    readonly handStrength: PokerHandStrength;
  };
  readonly opponents: readonly {
    readonly seat: number;
    readonly controller: PlayerController;
    readonly position: PokerPosition;
    readonly stack: number;
    readonly status: "active" | "folded" | "all_in";
  }[];
  readonly analysis: {
    readonly livePot?: number;
    readonly showdownEquity: number;
    readonly equityBasis: "random_opponent_hands";
    readonly equitySamples: number;
    readonly callCost: number;
    readonly contestablePotAfterCall: number;
    readonly potOddsToCall: number;
    readonly effectiveStack: number;
    readonly stackToPotRatio: number;
  };
  readonly actionHistory: readonly PokerAIDecisionHistoryItem[];
  readonly legalActions: readonly LegalAction[];
}

function normalizedController(
  controller: "human" | "bot" | "typesafe_ai",
): PlayerController {
  return controller === "human" ? "human" : "bot";
}

function projectActionHistory(
  history: readonly PokerAIActionHistoryItem[],
  heroSeat: number,
): readonly PokerAIDecisionHistoryItem[] {
  return history.map((item) => {
    const actorSeat: number | null = null;
    return {
      sequence: item.sequence,
      street: item.street,
      action: item.action,
      amount: item.amount,
      actorSeat,
      actor:
        actorSeat === null
          ? "unknown"
          : actorSeat === heroSeat
            ? "hero"
            : "opponent",
      controller: item.controller,
    };
  });
}

function contestablePotAfterCall(players: ReturnType<typeof pokerEngineAdapter.decisionView>["players"], heroId: string, callCost: number): number {
  const hero = players.find(p => p.id === heroId);
  if (!hero || hero.folded) return 0;
  const cap = hero.committedHand + callCost;
  const amounts = players.map(p => Math.min(cap, p.committedHand + (p.id === heroId ? callCost : 0)));
  const levels = [...new Set(amounts)].filter(n => n > 0).sort((a,b) => a-b);
  let previous = 0, total = 0;
  for (const level of levels) {
    const contributors = amounts.filter(n => n >= level).length;
    if (contributors >= 2) total += (level - previous) * contributors;
    previous = level;
  }
  return total;
}

export function createPokerAIState(
  state: PokerGameState,
  heroId: string,
  options: CreatePokerAIStateOptions = {},
): PokerAIState {
  const hand = pokerEngineAdapter.decisionView(state);
  const corrected = options.correctedContext ?? options.typesafePolicyV2 ?? false;
  if (!hand || hand.street === "complete") {
    throw new Error("Cannot build AI state for a completed hand");
  }

  const hero = hand.players.find((player) => player.id === heroId);
  const heroSeat = hero ? hand.players.find(p => p.seat === hero.seat) : null;
  if (!hero || !heroSeat) {
    throw new Error("AI player is not seated in the active hand");
  }

  const opponents = hand.players
    .filter((player) => player.id !== heroId)
    .map((player) => {
      const seat = hand.players.find(p => p.seat === player.seat);
      const config = state.config.players.find(
        (candidate) => candidate.id === player.id,
      );
      if (!seat || !config) {
        throw new Error("Opponent is missing table configuration");
      }
      return {
        seat: player.seat,
        controller: normalizedController(config.controller),
        position: player.position,
        stack: seat.stack,
        status: player.folded ? "folded" : player.allIn ? "all_in" : "active",
      } as const;
    });
  const legalActions = pokerEngineAdapter.getLegalActions(state);
  const pot = corrected ? hand.pot : hand.legacyPot;
  const legalCall = legalActions.find((action) => action.type === "call");
  const actualCallCost = legalCall?.type === "call" ? legalCall.amount : 0;
  const nominalCallCost = Math.max(0, hand.currentBet - hero.committedStreet);
  const amountToCall = corrected
    ? actualCallCost
    : nominalCallCost;
  const projectedContestablePot = contestablePotAfterCall(
    hand.players,
    heroId,
    actualCallCost,
  );
  const activeOpponentStacks = opponents
    .filter((opponent) => opponent.status !== "folded")
    .map((opponent) => opponent.stack);
  const effectiveStack = Math.min(
    heroSeat.stack,
    Math.max(0, ...activeOpponentStacks),
  );
  const equitySamples = options.equitySamples ?? 5_000;
  const holeCards = pokerEngineAdapter.heroCards(state, heroId);
  const communityCards = hand.communityCards;
  const actionHistory = options.decisionHistory ?? projectActionHistory(
    options.actionHistory ?? [],
    hero.seat,
  );
  const heroConfig = state.config.players.find((player) => player.id === heroId);
  if (!heroConfig) {
    throw new Error("AI player is missing from the game configuration");
  }

  const active = hand.players.filter(p => !p.folded);
  const order = hand.postflopOrder.filter(seat => active.some(p => p.seat === seat));
  const historyStatus = options.historyStatus ?? "unknown";
  const preflopActions = actionHistory.filter(a => a.street === "preflop");
  const raises = preflopActions.filter(a => a.action === "raise" || a.action === "bet").length;
  return {
    situation: {
      historyStatus,
      preflop: historyStatus === "unknown" ? "unknown" : raises > 1 ? "re-raised" : raises === 1 ? "raised" : preflopActions.some(a => a.action === "call") ? "limped" : "unopened",
      ...(corrected ? { dealtPlayerCount: hand.players.length, playersRemaining: active.length } : {}),
      activeOpponentCount: active.filter(p => p.id !== heroId).length,
      playersStillToAct: hand.remainingOrder.filter(seat => hand.players.some(p => p.seat === seat && p.id !== heroId && p.needsAction)),
      postflopPosition: order.at(-1) === hero.seat ? "in_position" : order[0] === hero.seat ? "out_of_position" : "between",
      buttonIsSmallBlind: hand.buttonSeat === hand.smallBlindSeat,
      preflopOrder: hand.preflopOrder, postflopOrder: hand.postflopOrder,
      effectiveStacks: active.filter(p => p.id !== heroId).map(p => ({ seat: p.seat, stack: Math.min(heroSeat.stack, p.stack) })),
    },
    difficulty: options.difficulty ?? "medium",
    game: {
      variant: "no_limit_texas_holdem",
      smallBlind: hand.smallBlind,
      bigBlind: hand.bigBlind,
      handNumber: hand.handNumber,
    },
    hand: {
      street: hand.street,
      pot,
      communityCards,
    },
    hero: {
      seat: hero.seat,
      controller: normalizedController(heroConfig.controller),
      holeCards,
      position: hero.position,
      stack: heroSeat.stack,
      investedThisStreet: hero.committedStreet,
      amountToCall,
      handStrength: pokerEngineAdapter.describePlayerHand(state, heroId),
    },
    opponents,
    analysis: {
      livePot: hand.pot,
      showdownEquity: calculateShowdownEquity({
        heroHoleCards: holeCards,
        communityCards,
        opponentCount: activeOpponentStacks.length,
        sampleCount: equitySamples,
        seed: JSON.stringify({
          handNumber: hand.handNumber,
          holeCards,
          communityCards,
          actionHistory,
        }),
      }),
      equityBasis: "random_opponent_hands",
      equitySamples,
      callCost: actualCallCost,
      contestablePotAfterCall: projectedContestablePot,
      potOddsToCall:
        amountToCall === 0
          ? 0
          : corrected
            ? Math.round((actualCallCost / projectedContestablePot) * 10_000) /
              10_000
            : Math.round((amountToCall / (pot + amountToCall)) * 10_000) /
              10_000,
      effectiveStack,
      stackToPotRatio:
        pot === 0 ? 0 : Math.round((effectiveStack / pot) * 100) / 100,
    },
    actionHistory,
    legalActions,
  };
}
