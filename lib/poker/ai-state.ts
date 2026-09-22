import {
  assertTableState,
  cardToString,
  type TableState,
} from "@hivetech/poker-engine";

import { pokerEngineAdapter } from "./adapter";
import type { LegalAction, PokerGameState, PokerStreet } from "./types";
import type { AIDifficulty } from "./types";
import { calculateShowdownEquity } from "./equity";

export interface PokerAIActionHistoryItem {
  readonly sequence: number;
  readonly street: Exclude<PokerStreet, "complete">;
  readonly action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  readonly amount: number | null;
  readonly player: string;
  readonly controller: "human" | "typesafe_ai";
}

export interface CreatePokerAIStateOptions {
  readonly actionHistory?: readonly PokerAIActionHistoryItem[];
  readonly difficulty?: AIDifficulty;
  readonly equitySamples?: number;
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
    readonly holeCards: readonly string[];
    readonly position: "button" | "small_blind" | "big_blind";
    readonly stack: number;
    readonly investedThisStreet: number;
    readonly amountToCall: number;
  };
  readonly opponents: readonly {
    readonly id: string;
    readonly position: "button" | "small_blind" | "big_blind";
    readonly stack: number;
    readonly status: "active" | "folded" | "all_in";
  }[];
  readonly analysis: {
    readonly showdownEquity: number;
    readonly equitySamples: number;
    readonly potOddsToCall: number;
    readonly effectiveStack: number;
    readonly stackToPotRatio: number;
  };
  readonly actionHistory: readonly PokerAIActionHistoryItem[];
  readonly legalActions: readonly LegalAction[];
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
      if (!seat) {
        throw new Error("Opponent is missing a table seat");
      }
      return {
        id: player.playerId,
        position: positionForSeat(table, player.seat),
        stack: seat.stack,
        status: player.folded ? "folded" : player.allIn ? "all_in" : "active",
      } as const;
    });
  const pot = hand.pots.reduce((total, currentPot) => total + currentPot.amount, 0);
  const amountToCall = Math.max(0, hand.currentBet - hero.committedStreet);
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
      holeCards,
      position: positionForSeat(table, hero.seat),
      stack: heroSeat.stack,
      investedThisStreet: hero.committedStreet,
      amountToCall,
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
          actionHistory: options.actionHistory ?? [],
        }),
      }),
      equitySamples,
      potOddsToCall:
        amountToCall === 0
          ? 0
          : Math.round((amountToCall / (pot + amountToCall)) * 10_000) /
            10_000,
      effectiveStack,
      stackToPotRatio:
        pot === 0 ? 0 : Math.round((effectiveStack / pot) * 100) / 100,
    },
    actionHistory: options.actionHistory ?? [],
    legalActions: pokerEngineAdapter.getLegalActions(state),
  };
}
