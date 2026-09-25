import {
  assertTableState,
  cardToString,
  type TableState,
} from "@hivetech/poker-engine";

import { pokerEngineAdapter } from "./adapter";
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
}

export interface CreatePokerAIStateOptions {
  readonly actionHistory?: readonly PokerAIActionHistoryItem[];
  readonly difficulty?: AIDifficulty;
  readonly equitySamples?: number;
  /** Opts only TypeSafe v2 into corrected call and contestable-pot context. */
  readonly typesafePolicyV2?: boolean;
}

export interface PokerAIState {
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
    readonly position: "button" | "small_blind" | "big_blind";
    readonly stack: number;
    readonly investedThisStreet: number;
    readonly amountToCall: number;
    readonly handStrength: PokerHandStrength;
  };
  readonly opponents: readonly {
    readonly seat: number;
    readonly controller: PlayerController;
    readonly position: "button" | "small_blind" | "big_blind";
    readonly stack: number;
    readonly status: "active" | "folded" | "all_in";
  }[];
  readonly analysis: {
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
  players: PokerGameState["config"]["players"],
  heroSeat: number,
): readonly PokerAIDecisionHistoryItem[] {
  return history.map((item) => {
    const matchingPlayers = players.filter(
      (player) => player.name === item.player,
    );
    const actorSeat =
      matchingPlayers.length === 1 ? matchingPlayers[0].seat : null;
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

function contestablePotAfterCall(
  hand: NonNullable<TableState["hand"]>,
  heroId: string,
  callCost: number,
): number {
  const commitments = hand.players.map((player) => ({
    playerId: player.playerId,
    folded: player.folded,
    committedHand:
      player.committedHand + (player.playerId === heroId ? callCost : 0),
  }));
  const hero = commitments.find((player) => player.playerId === heroId);
  if (!hero || hero.folded) return 0;

  const levels = [...new Set(commitments.map((player) => player.committedHand))]
    .filter((amount) => amount > 0)
    .sort((left, right) => left - right);
  let previousLevel = 0;
  let total = 0;
  for (const level of levels) {
    const contributors = commitments.filter(
      (player) => player.committedHand >= level,
    );
    const amount = (level - previousLevel) * contributors.length;
    previousLevel = level;
    if (
      contributors.length >= 2 &&
      contributors.some((player) => player.playerId === heroId)
    ) {
      total += amount;
    }
  }
  return total;
}

function engineStateFrom(state: PokerGameState): TableState {
  const engineState = state.engineState as TableState;
  assertTableState(engineState);
  return engineState;
}

function positionForSeat(
  table: TableState,
  seat: number,
): "button" | "small_blind" | "big_blind" {
  const hand = table.hand;
  if (!hand) {
    throw new Error("Cannot build AI state without an active hand");
  }
  if (seat === hand.buttonSeat) {
    return "button";
  }
  if (seat === hand.smallBlindSeat) {
    return "small_blind";
  }
  return "big_blind";
}

export function createPokerAIState(
  state: PokerGameState,
  heroId: string,
  options: CreatePokerAIStateOptions = {},
): PokerAIState {
  const table = engineStateFrom(state);
  const hand = table.hand;
  if (!hand || hand.stage === "complete") {
    throw new Error("Cannot build AI state for a completed hand");
  }

  const hero = hand.players.find((player) => player.playerId === heroId);
  const heroSeat = hero ? table.seats[hero.seat] : null;
  if (!hero || !heroSeat) {
    throw new Error("AI player is not seated in the active hand");
  }

  const opponents = hand.players
    .filter((player) => player.playerId !== heroId)
    .map((player) => {
      const seat = table.seats[player.seat];
      const config = state.config.players.find(
        (candidate) => candidate.id === player.playerId,
      );
      if (!seat || !config) {
        throw new Error("Opponent is missing table configuration");
      }
      return {
        seat: player.seat,
        controller: normalizedController(config.controller),
        position: positionForSeat(table, player.seat),
        stack: seat.stack,
        status: player.folded ? "folded" : player.allIn ? "all_in" : "active",
      } as const;
    });
  const legalActions = pokerEngineAdapter.getLegalActions(state);
  const pot = hand.pots.reduce((total, currentPot) => total + currentPot.amount, 0);
  const legalCall = legalActions.find((action) => action.type === "call");
  const actualCallCost = legalCall?.type === "call" ? legalCall.amount : 0;
  const nominalCallCost = Math.max(0, hand.currentBet - hero.committedStreet);
  const amountToCall = options.typesafePolicyV2
    ? actualCallCost
    : nominalCallCost;
  const projectedContestablePot = contestablePotAfterCall(
    hand,
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
  const holeCards = hero.holeCards.map(cardToString);
  const communityCards = hand.communityCards.map(cardToString);
  const actionHistory = projectActionHistory(
    options.actionHistory ?? [],
    state.config.players,
    hero.seat,
  );
  const heroConfig = state.config.players.find((player) => player.id === heroId);
  if (!heroConfig) {
    throw new Error("AI player is missing from the game configuration");
  }

  return {
    difficulty: options.difficulty ?? "medium",
    game: {
      variant: "no_limit_texas_holdem",
      smallBlind: table.config.smallBlind,
      bigBlind: table.config.bigBlind,
      handNumber: hand.handNumber,
    },
    hand: {
      street: hand.stage,
      pot,
      communityCards,
    },
    hero: {
      seat: hero.seat,
      controller: normalizedController(heroConfig.controller),
      holeCards,
      position: positionForSeat(table, hero.seat),
      stack: heroSeat.stack,
      investedThisStreet: hero.committedStreet,
      amountToCall,
      handStrength: pokerEngineAdapter.describePlayerHand(state, heroId),
    },
    opponents,
    analysis: {
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
          : options.typesafePolicyV2
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
