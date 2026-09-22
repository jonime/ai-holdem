import {
  assertTableState,
  cardToString,
  type TableState,
} from "@hivetech/poker-engine";

import { pokerEngineAdapter } from "./adapter";
import type { LegalAction, PokerGameState, PokerStreet } from "./types";

export interface PokerAIState {
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
  readonly actionHistory: readonly [];
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

  return {
    game: {
      variant: "no_limit_texas_holdem",
      smallBlind: table.config.smallBlind,
      bigBlind: table.config.bigBlind,
      handNumber: hand.handNumber,
    },
    hand: {
      street: hand.stage,
      pot: hand.pots.reduce((total, pot) => total + pot.amount, 0),
      communityCards: hand.communityCards.map(cardToString),
    },
    hero: {
      holeCards: hero.holeCards.map(cardToString),
      position: positionForSeat(table, hero.seat),
      stack: heroSeat.stack,
      investedThisStreet: hero.committedStreet,
      amountToCall: Math.max(0, hand.currentBet - hero.committedStreet),
    },
    opponents: hand.players
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
        };
      }),
    actionHistory: [],
    legalActions: pokerEngineAdapter.getLegalActions(state),
  };
}
