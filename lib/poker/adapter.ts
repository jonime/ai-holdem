import {
  assertCompleteDeck,
  assertTableState,
  cardToString,
  createDeck,
  createShuffledDeck,
  createTable,
  getLegalActions as getEngineLegalActions,
  parseCard,
  projectTable,
  transition,
  type Card,
  type PlayerAction,
  type TableState,
} from "@hivetech/poker-engine";

import {
  type GameConfig,
  type LegalAction,
  type PokerAction,
  type PokerGameSnapshot,
  type PokerGameState,
  type PublicPokerGame,
  PokerRuleError,
} from "./types";

function transitionOrThrow(
  state: TableState,
  command: Parameters<typeof transition>[1],
): TableState {
  const result = transition(state, command);

  if (!result.ok) {
    throw new PokerRuleError(`${result.error.code}: ${result.error.message}`);
  }

  return result.state;
}

function engineStateFrom(state: PokerGameState): TableState {
  const engineState = state.engineState as TableState;
  assertTableState(engineState);
  return engineState;
}

function withEngineState(
  config: GameConfig,
  engineState: TableState,
): PokerGameState {
  return {
    stateSchemaVersion: 1,
    config,
    engineState,
  };
}

function toEngineAction(action: PokerAction): PlayerAction {
  switch (action.type) {
    case "fold":
    case "check":
    case "call":
      return { kind: action.type };
    case "bet":
      return { kind: "bet-to", amount: action.amount };
    case "raise":
      return { kind: "raise-to", amount: action.amount };
  }
}

function toLegalAction(
  action: ReturnType<typeof getEngineLegalActions>[number],
): LegalAction {
  switch (action.kind) {
    case "fold":
    case "check":
      return { type: action.kind };
    case "call":
      return { type: "call", amount: action.amount };
    case "bet-to":
      return {
        type: "bet",
        minAmount: action.minAmount,
        maxAmount: action.maxAmount,
      };
    case "raise-to":
      return {
        type: "raise",
        minAmount: action.minAmount,
        maxAmount: action.maxAmount,
      };
  }
}

function validateAction(
  legalActions: readonly LegalAction[],
  action: PokerAction,
): void {
  const legalAction = legalActions.find(
    (candidate) => candidate.type === action.type,
  );

  if (!legalAction) {
    throw new PokerRuleError(`Action is not legal: ${action.type}`);
  }

  if (
    action.type === "call" &&
    action.amount !== undefined &&
    (legalAction.type !== "call" || action.amount !== legalAction.amount)
  ) {
    throw new PokerRuleError("Call amount must match the legal call amount");
  }

  if (action.type === "bet" || action.type === "raise") {
    if (
      legalAction.type !== action.type ||
      action.amount < legalAction.minAmount ||
      action.amount > legalAction.maxAmount
    ) {
      throw new PokerRuleError(
        `Amount is outside the legal ${action.type} range`,
      );
    }
  }
}

export function createDeterministicDeck(
  cards: readonly string[] = [],
): readonly Card[] {
  const requestedCards = cards.map(parseCard);
  const requestedCardNames = new Set(cards);

  if (requestedCardNames.size !== cards.length) {
    throw new PokerRuleError(
      "A deterministic deck cannot contain duplicate cards",
    );
  }

  const remainingCards = createDeck().filter(
    (card) => !requestedCardNames.has(cardToString(card)),
  );
  const deck = [...requestedCards, ...remainingCards];
  assertCompleteDeck(deck);
  return deck;
}

export const pokerEngineAdapter = {
  createGame(config: GameConfig): PokerGameState {
    if (config.players.length < 2) {
      throw new PokerRuleError(
        "A Texas Hold'em game requires at least two players",
      );
    }

    let table = createTable({
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      maxSeats: Math.max(...config.players.map((player) => player.seat + 1)),
      minBuyIn: 1,
    });

    for (const player of config.players) {
      table = transitionOrThrow(table, {
        type: "seat-player",
        playerId: player.id,
        stack: player.stack,
        seat: player.seat,
      });
    }

    return withEngineState(config, table);
  },

  startHand(
    state: PokerGameState,
    deck: readonly Card[] = createShuffledDeck(),
  ): PokerGameState {
    assertCompleteDeck(deck);
    return withEngineState(
      state.config,
      transitionOrThrow(engineStateFrom(state), { type: "start-hand", deck }),
    );
  },

  getLegalActions(state: PokerGameState): readonly LegalAction[] {
    const table = engineStateFrom(state);
    const actorSeat = table.hand?.currentActorSeat;
    const actor = table.hand?.players.find(
      (player) => player.seat === actorSeat,
    );

    return actor
      ? getEngineLegalActions(table, actor.playerId).map(toLegalAction)
      : [];
  },

  applyAction(
    state: PokerGameState,
    playerId: string,
    action: PokerAction,
  ): PokerGameState {
    const table = engineStateFrom(state);
    const actor = table.hand?.players.find(
      (player) => player.seat === table.hand?.currentActorSeat,
    );

    if (!actor || actor.playerId !== playerId) {
      throw new PokerRuleError("Player is not the current actor");
    }

    const legalActions = this.getLegalActions(state);
    validateAction(legalActions, action);

    return withEngineState(
      state.config,
      transitionOrThrow(table, {
        type: "act",
        playerId,
        action: toEngineAction(action),
      }),
    );
  },

  snapshot(state: PokerGameState): PokerGameSnapshot {
    const table = engineStateFrom(state);
    const hand = table.hand;
    const actor = hand?.players.find(
      (player) => player.seat === hand.currentActorSeat,
    );
    const winnerIds = hand
      ? [...new Set(hand.pots.flatMap((pot) => pot.winnerPlayerIds))]
      : [];

    return {
      handNumber: table.handNumber,
      street: hand?.stage ?? null,
      currentActorId: actor?.playerId ?? null,
      communityCards: hand?.communityCards.map(cardToString) ?? [],
      pot: hand?.pots.reduce((total, pot) => total + pot.amount, 0) ?? 0,
      completionReason: hand?.completionReason ?? null,
      winnerIds,
    };
  },

  publicProjection(
    state: PokerGameState,
    viewerPlayerId: string,
  ): PublicPokerGame {
    const table = engineStateFrom(state);
    const projectedTable = projectTable(table, {
      kind: "player",
      playerId: viewerPlayerId,
    });
    const snapshot = this.snapshot(state);

    return {
      ...snapshot,
      legalActions:
        snapshot.currentActorId === viewerPlayerId
          ? this.getLegalActions(state)
          : [],
      players:
        projectedTable.hand?.players.map((player) => {
          const config = state.config.players.find(
            (candidate) => candidate.id === player.playerId,
          );
          const seat = table.seats[player.seat];

          if (!config || !seat) {
            throw new PokerRuleError(
              "Engine player is missing game configuration",
            );
          }

          return {
            id: player.playerId,
            name: config.name,
            controller: config.controller,
            seat: player.seat,
            stack: seat.stack,
            folded: player.folded,
            allIn: player.allIn,
            holeCards: player.holeCards?.map(cardToString) ?? null,
          };
        }) ?? [],
    };
  },

  restore(state: PokerGameState): PokerGameState {
    engineStateFrom(state);
    return state;
  },
};
