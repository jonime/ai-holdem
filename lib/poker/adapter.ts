import {
  assertCompleteDeck,
  assertTableState,
  cardToString,
  compareHandRanks,
  createDeck,
  createShuffledDeck,
  createTable,
  evaluateHand,
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
  type PokerPlayerConfig,
  type PokerGameSnapshot,
  type PokerGameState,
  type PokerHandStrength,
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

const rankNameByValue: Readonly<Record<number, string>> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "T",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

const rankValueByName: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(rankNameByValue).map(([value, rank]) => [rank, Number(value)]),
);

function straightCompletionRanks(cards: readonly Card[]): readonly string[] {
  const values = new Set(cards.map((card) => rankValueByName[card.rank]));
  if (values.has(14)) values.add(1);
  const completions = new Set<number>();
  for (let high = 5; high <= 14; high += 1) {
    const window = Array.from({ length: 5 }, (_, index) => high - index);
    const missing = window.filter((value) => !values.has(value));
    if (missing.length === 1) {
      completions.add(missing[0] === 1 ? 14 : missing[0]);
    }
  }
  return [...completions]
    .sort((left, right) => left - right)
    .map((value) => rankNameByValue[value]);
}

function describeHand(
  holeCards: readonly Card[],
  communityCards: readonly Card[],
): PokerHandStrength {
  const knownCards = [...holeCards, ...communityCards];
  const rank = knownCards.length >= 5 ? evaluateHand(knownCards) : null;
  const bestFive = rank?.cards.map(cardToString) ?? [];
  const holeCardNames = new Set(holeCards.map(cardToString));
  const boardRank =
    communityCards.length === 5 ? evaluateHand(communityCards) : null;
  const suitCounts = knownCards.reduce<Record<string, number>>(
    (counts, card) => {
      counts[card.suit] = (counts[card.suit] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const drawsRemain = communityCards.length >= 3 && communityCards.length < 5;
  const alreadyStraight =
    rank?.category === "straight" || rank?.category === "straight-flush";

  return {
    madeHand: rank?.category ?? null,
    bestFive,
    usesHoleCards:
      rank !== null &&
      (boardRank === null
        ? bestFive.some((card) => holeCardNames.has(card))
        : compareHandRanks(rank, boardRank) > 0),
    draws: {
      flushDraw:
        drawsRemain &&
        rank?.category !== "flush" &&
        rank?.category !== "straight-flush" &&
        Math.max(0, ...Object.values(suitCounts)) === 4,
      straightCompletionRanks:
        drawsRemain && !alreadyStraight
          ? straightCompletionRanks(knownCards)
          : [],
    },
  };
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
    if (config.players.length < 1) {
      throw new PokerRuleError("A poker table requires at least one player");
    }

    const configuredSeatCount =
      config.seatCount ??
      Math.max(0, ...config.players.map((player) => player.seat + 1));

    let table = createTable({
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      maxSeats: configuredSeatCount,
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

  seatPlayer(state: PokerGameState, player: PokerPlayerConfig): PokerGameState {
    const table = transitionOrThrow(engineStateFrom(state), {
      type: "seat-player",
      playerId: player.id,
      stack: player.stack,
      seat: player.seat,
    });
    return withEngineState(
      {
        ...state.config,
        players: [...state.config.players, player],
      },
      table,
    );
  },

  removePlayer(state: PokerGameState, playerId: string): PokerGameState {
    const table = transitionOrThrow(engineStateFrom(state), {
      type: "leave-player",
      playerId,
    });
    return withEngineState(
      {
        ...state.config,
        players: state.config.players.filter(
          (player) => player.id !== playerId,
        ),
      },
      table,
    );
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

  describePlayerHand(
    state: PokerGameState,
    playerId: string,
  ): PokerHandStrength {
    const table = engineStateFrom(state);
    const player = table.hand?.players.find(
      (candidate) => candidate.playerId === playerId,
    );
    if (!table.hand || !player) {
      throw new PokerRuleError("Player is not in the active hand");
    }
    return describeHand(player.holeCards, table.hand.communityCards);
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
    const dealerSeat = hand?.buttonSeat ?? null;
    const smallBlindSeat = hand?.smallBlindSeat ?? null;
    const bigBlindSeat = hand?.bigBlindSeat ?? null;
    const actor = hand?.players.find(
      (player) => player.seat === hand.currentActorSeat,
    );
    const winnerIds = hand
      ? [...new Set(hand.pots.flatMap((pot) => pot.winnerPlayerIds))]
      : [];
    const winnerAmounts = hand
      ? hand.pots
          .flatMap((pot) => pot.awards)
          .reduce<Record<string, number>>(
            (amounts, award) => ({
              ...amounts,
              [award.playerId]: (amounts[award.playerId] ?? 0) + award.amount,
            }),
            {},
          )
      : {};

    return {
      handNumber: table.handNumber,
      street: hand?.stage ?? null,
      dealerSeat,
      smallBlindSeat,
      bigBlindSeat,
      currentActorId: actor?.playerId ?? null,
      communityCards: hand?.communityCards.map(cardToString) ?? [],
      pot: hand?.pots.reduce((total, pot) => total + pot.amount, 0) ?? 0,
      completionReason: hand?.completionReason ?? null,
      winnerIds,
      winnerAmounts,
    };
  },

  publicProjection(
    state: PokerGameState,
    viewerPlayerId: string | null,
    revealedPlayerIds: readonly string[] = [],
  ): PublicPokerGame {
    const table = engineStateFrom(state);
    const effectiveViewerId =
      viewerPlayerId &&
      state.config.players.some((player) => player.id === viewerPlayerId)
        ? viewerPlayerId
        : null;
    const projectedTable = projectTable(table, {
      kind: effectiveViewerId === null ? "spectator" : "player",
      playerId: effectiveViewerId ?? "",
    });
    const projectedPlayers = new Map(
      projectedTable.hand?.players.map((player) => [player.playerId, player]) ??
        [],
    );
    const sourcePlayers = new Map(
      table.hand?.players.map((player) => [player.playerId, player]) ?? [],
    );
    const snapshot = this.snapshot(state);
    const revealedIds = new Set(revealedPlayerIds);
    const publicAtCompletion =
      snapshot.street === "complete" &&
      snapshot.completionReason === "showdown";

    const seatCount =
      state.config.seatCount ??
      Math.max(0, ...state.config.players.map((player) => player.seat + 1));

    return {
      ...snapshot,
      seatCount,
      smallBlind: state.config.smallBlind,
      bigBlind: state.config.bigBlind,
      startingStack:
        state.config.startingStack ?? state.config.players[0]?.stack ?? 10_000,
      botsShowUncontestedWins: false,
      legalActions:
        effectiveViewerId !== null &&
        snapshot.currentActorId === effectiveViewerId
          ? this.getLegalActions(state)
          : [],
      players: state.config.players.map((config) => {
        const player = projectedPlayers.get(config.id);
        const sourcePlayer = sourcePlayers.get(config.id);
        const seat = table.seats[config.seat];

        const isViewer =
          effectiveViewerId !== null && config.id === effectiveViewerId;

        return {
          id: config.id,
          name: config.name,
          controller: config.controller === "human" ? "human" : "bot",
          bot:
            config.controller === "human"
              ? null
              : (config.bot ?? {
                  id: "jev",
                  label: "TypeSafe Jev",
                  provider: "typesafe",
                  modelId: "jev-latest",
                }),
          aiDifficulty:
            config.controller !== "human" &&
            ((config.bot?.provider ?? "typesafe") === "typesafe" ||
              (config.bot?.provider ?? "typesafe") === "rules")
              ? (config.aiDifficulty ?? "medium")
              : null,
          seat: config.seat,
          status:
            config.status ??
            (config.controller !== "human" ? "bot" : "claimed"),
          playerToken: isViewer ? (config.playerToken ?? null) : null,
          isHost: config.isHost ?? false,
          leaving: config.leaving ?? false,
          inHand: player !== undefined,
          stack: seat?.stack ?? config.stack,
          folded: player?.folded ?? false,
          allIn: player?.allIn ?? false,
          bestHand:
            publicAtCompletion && player && !player.folded
              ? (sourcePlayer?.handRank?.category ?? null)
              : null,
          cardsRevealed:
            Boolean(player) &&
            (revealedIds.has(config.id) ||
              (publicAtCompletion && !player?.folded)),
          holeCards: (() => {
            if (!player) return null;
            const isPublic =
              revealedIds.has(config.id) ||
              (publicAtCompletion && !player.folded);
            return isViewer || isPublic
              ? (sourcePlayer?.holeCards?.map(cardToString) ?? null)
              : null;
          })(),
        };
      }),
    };
  },

  restore(state: PokerGameState): PokerGameState {
    engineStateFrom(state);
    return state;
  },
};
