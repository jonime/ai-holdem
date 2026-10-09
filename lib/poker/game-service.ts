import type {
  GameSessionWriter,
  GameReader,
  GameSnapshotReader,
  HandRevealReader,
  HumanRevealWriter,
  HumanActionWriter,
  GameFeedReader,
  NextHandWriter,
  StartGameWriter,
  UpdateSeatCountWriter,
  UpdateTableSettingsWriter,
  DepartureWriter,
} from "./game-service-contracts";
import { GameNotFoundError } from "./game-errors";
import { restorePersistedState } from "./persisted-state";
import { BotStepForbiddenError, requireBotDriver } from "./driver-authorization";
import {
  enginePlayerIdForAssignment,
  supportsDifficulty,
  playerConfigForAssignment,
  withOpenSeatPlaceholders,
  reconcilePublicSeats,
  publicLiveSeats,
  publicProjectionForViewer,
  currentRevealIds,
  autoRevealForCompletedState,
  publicTimerFields,
} from "./game-projection";
import type { DepartureFold } from "./departure-contracts";
import { isCallerHost, type GameHostReader } from "./host-authorization";
import type { SeatAssignment, SeatAssignmentRepository } from "./seat-contracts";
export type { SeatAssignment, SeatAssignmentRepository } from "./seat-contracts";
import { pokerEngineAdapter } from "./adapter";
import { HumanActionError, applyHumanAction, type HumanActionSubmission } from "./human-actions";
import type {
  BotDescriptor,
  BotPlaystyleId,
  GameConfig,
  PokerGameState,
  PokerPlayerConfig,
  TableSettings,
} from "./types";
import type {
  PersistHumanActionInput,
  PersistedGame,
} from "@/lib/supabase/queries";
import { GameConflictError } from "@/lib/supabase/queries";
import {
  equityRulesV2BotDescriptor,
  getBotCatalog,
} from "@/lib/bots/registry";

export interface CreateDemoGameOptions {
  readonly humanTurnSeconds?: import("./types").HumanTurnSeconds;
  readonly seatCount?: number;
  readonly smallBlind?: number;
  readonly bigBlind?: number;
  readonly startingStack?: number;
  readonly hostToken?: string;
  readonly hostName?: string;
}

export interface CreateQuickPlayGameOptions {
  readonly botMode?: "rules";
  readonly hostToken: string;
  readonly hostName?: string;
}

const quickPlayBotPlaystyles = [
  "balanced",
  "tight",
  "aggressive",
] as const satisfies readonly BotPlaystyleId[];

function shuffled<T>(values: readonly T[]): T[] {
  const shuffledValues = [...values];
  for (let index = shuffledValues.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledValues[index], shuffledValues[swapIndex]] = [
      shuffledValues[swapIndex],
      shuffledValues[index],
    ];
  }
  return shuffledValues;
}

function quickPlayBotSelections(botMode?: "rules"): readonly BotDescriptor[] {
  const catalog = getBotCatalog();
  const availableCatalog =
    botMode === "rules" || process.env.EXTERNAL_INFERENCE_ENABLED === "false"
      ? catalog.filter((bot) => bot.provider === "rules")
      : catalog;
  if (availableCatalog.length === 0) {
    return Array.from({ length: 5 }, () => equityRulesV2BotDescriptor);
  }

  const selections = (["rules", "typesafe", "llm"] as const).flatMap(
    (provider) => {
      const providerBots = availableCatalog.filter(
        (bot) => bot.provider === provider,
      );
      return providerBots.length > 0 ? [shuffled(providerBots)[0]] : [];
    },
  );
  while (selections.length < 5) {
    for (const bot of shuffled(availableCatalog)) {
      selections.push(bot);
      if (selections.length === 5) break;
    }
  }
  return shuffled(selections.slice(0, 5));
}

const maxPlayerNameLength = 30;

export function sanitizePlayerName(
  raw: string | null | undefined,
  fallback: string,
): string {
  const trimmed = (raw ?? "").trim();
  return trimmed ? trimmed.slice(0, maxPlayerNameLength) : fallback;
}

export function createDemoGameConfig(
  options: CreateDemoGameOptions = {},
): GameConfig {
  const seatCount = Math.min(6, Math.max(2, options.seatCount ?? 6));
  const smallBlind = options.smallBlind ?? 50;
  const bigBlind = options.bigBlind ?? 100;
  const startingStack = options.startingStack ?? 10_000;

  return {
    humanTurnSeconds: options.humanTurnSeconds === undefined ? 60 : options.humanTurnSeconds,
    smallBlind,
    bigBlind,
    startingStack,
    seatCount,
    players: [
      {
        id: "human",
        seat: 0,
        name: sanitizePlayerName(options.hostName, "Player 1"),
        controller: "human",
        stack: startingStack,
        status: "claimed",
        playerToken: options.hostToken ?? null,
        isHost: true,
      },
    ],
  };
}

export const demoGameConfig: GameConfig = createDemoGameConfig();

export type { GameFeedEvent as PublicFeedEvent, GameFeed as PublicGameFeed } from "@/lib/http/feed-contracts";
import type {
  GameFeedEvent as PublicFeedEvent,
  GameFeed as PublicGameFeed,
} from "@/lib/http/feed-contracts";

const bettingStreets = ["preflop", "flop", "turn", "river"] as const;

function boardThroughStreet(
  street: (typeof bettingStreets)[number],
  board: readonly string[],
): readonly string[] {
  switch (street) {
    case "preflop":
      return [];
    case "flop":
      return board.slice(0, 3);
    case "turn":
      return board.slice(0, 4);
    case "river":
      return board.slice(0, 5);
  }
}

export interface CreatedGame {
  readonly gameId: string;
  readonly state: PokerGameState;
  readonly version: number;
}

export type { GameplayGame as PublicGame, GameplayAIDecision as PublicAIDecision } from "@/lib/http/gameplay-contracts";
import type { GameplayGame as PublicGame } from "@/lib/http/gameplay-contracts";

export async function createDemoGame(
  repository: GameSessionWriter,
  options: CreateDemoGameOptions = {},
): Promise<CreatedGame> {
  const config = createDemoGameConfig(options);
  const initialState = pokerEngineAdapter.createGame(config);
  const persistedGame = await repository.createGameSession({
    hostToken: options.hostToken,
    currentState: initialState,
    stateSchemaVersion: initialState.stateSchemaVersion,
    handNumber: 0,
    status: "waiting",
    players: Array.from({ length: config.seatCount ?? 2 }, (_, seat) => {
      const player = initialState.config.players.find(
        (candidate) => candidate.seat === seat,
      );
      return {
        enginePlayerId: player?.id ?? null,
        seat,
        name: player?.name ?? `Seat ${seat + 1}`,
        controller: player?.controller ?? "human",
        bot: player?.bot ?? null,
        aiDifficulty: player?.aiDifficulty ?? null,
        stack: player?.stack ?? config.startingStack ?? 10_000,
        status: player?.status ?? "open",
        playerToken: player?.playerToken ?? null,
        isHost: player?.isHost ?? false,
      };
    }),
  });

  return {
    gameId: persistedGame.id,
    state: initialState,
    version: persistedGame.version,
  };
}

export async function createQuickPlayGame(
  repository: GameSessionWriter,
  options: CreateQuickPlayGameOptions,
): Promise<CreatedGame> {
  const startingStack = 10_000;
  const bots = quickPlayBotSelections(options.botMode);
  const config: GameConfig = {
    humanTurnSeconds: null,
    smallBlind: 50,
    bigBlind: 100,
    startingStack,
    seatCount: 6,
    players: [
      {
        id: "human",
        seat: 0,
        name: sanitizePlayerName(options.hostName, "Player 1"),
        controller: "human",
        stack: startingStack,
        status: "claimed",
        playerToken: options.hostToken,
        isHost: true,
      },
      ...bots.map((bot, index): PokerPlayerConfig => {
        const seat = index + 1;
        return {
          id: `quick-bot-${seat}-${bot.id}`,
          seat,
          name: `${bot.label} #${seat}`,
          controller: "bot",
          bot,
          aiDifficulty: supportsDifficulty(bot.provider) ? "medium" : null,
          botProfileId:
            bot.provider === "llm"
              ? quickPlayBotPlaystyles[
                  Math.floor(Math.random() * quickPlayBotPlaystyles.length)
                ]
              : null,
          stack: startingStack,
          status: "bot",
          playerToken: null,
          isHost: false,
        };
      }),
    ],
  };
  const initialState = pokerEngineAdapter.startHand(
    pokerEngineAdapter.createGame(config),
  );
  const snapshot = pokerEngineAdapter.snapshot(initialState);
  const persistedGame = await repository.createGameSession({
    hostToken: options.hostToken,
    currentState: initialState,
    stateSchemaVersion: initialState.stateSchemaVersion,
    handNumber: snapshot.handNumber,
    status: "playing",
    players: config.players.map((player) => ({
      enginePlayerId: player.id,
      seat: player.seat,
      name: player.name,
      controller: player.controller,
      bot: player.bot ?? null,
      aiDifficulty: player.aiDifficulty ?? null,
      botProfileId: player.botProfileId ?? null,
      stack: player.stack,
      status: player.status,
      playerToken: player.playerToken ?? null,
      isHost: player.isHost ?? false,
      leaving: player.leaving ?? false,
    })),
  });

  return {
    gameId: persistedGame.id,
    state: initialState,
    version: persistedGame.version,
  };
}

async function reconcileState(
  repository: SeatAssignmentRepository,
  gameId: string,
  state: PokerGameState,
): Promise<PokerGameState> {
  const assignments = await Promise.all(
    (await repository.getSeatAssignments(gameId)).map(async (assignment) => {
      // Human assignments are cleared by the completing action transaction.
      // Only the existing bot-credit departure keeps next-hand reconciliation.
      if (!assignment.leaving || assignment.controller === "human") return assignment;

      const openAssignment: SeatAssignment = {
        ...assignment,
        name: `Seat ${assignment.seat + 1}`,
        status: "open",
        controller: "human",
        bot: null,
        aiDifficulty: null,
        botProfileId: null,
        playerToken: null,
        isHost: false,
        leaving: false,
      };
      await repository.updateSeatAssignment({
        gameId,
        seat: assignment.seat,
        name: openAssignment.name,
        status: "open",
        controller: "human",
        bot: null,
        aiDifficulty: null,
        botProfileId: null,
        playerToken: null,
        isHost: false,
        leaving: false,
      });
      return openAssignment;
    }),
  );
  const startingStack =
    state.config.startingStack ?? state.config.players[0]?.stack ?? 10_000;
  const filled = assignments.filter(
    (assignment) =>
      (assignment.status === "claimed" || assignment.status === "bot") &&
      !assignment.leaving,
  );
  const waitingSnapshot = pokerEngineAdapter.snapshot(state);
  if (!waitingSnapshot.street) {
    for (const assignment of filled) {
      if (assignment.enginePlayerId) continue;
      await repository.updateSeatAssignment({
        gameId,
        seat: assignment.seat,
        status: assignment.status,
        enginePlayerId: enginePlayerIdForAssignment(gameId, assignment),
      });
    }
    return pokerEngineAdapter.createGame({
      ...state.config,
      players: filled.map((assignment) =>
        playerConfigForAssignment(gameId, assignment, startingStack),
      ),
    });
  }
  const desiredIds = new Set(
    filled.map((assignment) => enginePlayerIdForAssignment(gameId, assignment)),
  );
  let nextState = state;
  for (const player of state.config.players) {
    if (!desiredIds.has(player.id)) {
      nextState = pokerEngineAdapter.removePlayer(nextState, player.id);
    }
  }
  for (const assignment of filled) {
    const playerId = enginePlayerIdForAssignment(gameId, assignment);
    if (!nextState.config.players.some((player) => player.id === playerId)) {
      nextState = pokerEngineAdapter.seatPlayer(
        nextState,
        playerConfigForAssignment(gameId, assignment, startingStack),
      );
      await repository.updateSeatAssignment({
        gameId,
        seat: assignment.seat,
        status: assignment.status,
        enginePlayerId: playerId,
      });
    }
  }
  const assignmentsById = new Map(
    filled.map((assignment) => [
      enginePlayerIdForAssignment(gameId, assignment),
      assignment,
    ]),
  );
  return {
    ...nextState,
    config: {
      ...nextState.config,
      players: nextState.config.players.map((player) => {
        const assignment = assignmentsById.get(player.id);
        return assignment
          ? {
              ...player,
              name: assignment.name ?? player.name,
              controller: assignment.controller,
              bot: assignment.controller === "bot" ? assignment.bot : null,
              aiDifficulty: supportsDifficulty(assignment.bot?.provider)
                ? (assignment.aiDifficulty ?? "medium")
                : null,
            }
          : player;
      }),
    },
  };
}

export async function startGame(
  repository: GameReader &
    SeatAssignmentRepository &
    StartGameWriter &
    GameHostReader,
  gameId: string,
  expectedVersion: number,
  callerToken: string,
): Promise<PublicGame> {
  const game = await repository.getGame(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  if (game.status !== "waiting") throw new Error("The game is not waiting");
  if (game.version !== expectedVersion) {
    throw new GameConflictError(gameId, expectedVersion);
  }

  const assignments = await repository.getSeatAssignments(gameId);
  if (!(await isCallerHost(repository, gameId, callerToken))) {
    throw new Error("Only the host can start the game");
  }

  const filled = assignments.filter(
    (assignment) =>
      (assignment.status === "claimed" || assignment.status === "bot") &&
      !assignment.leaving,
  );
  if (filled.length < 2) throw new Error("At least two seats are required");

  const state = await reconcileState(
    repository,
    gameId,
    restorePersistedState(game.currentState),
  );

  const nextState = pokerEngineAdapter.startHand(state);
  const snapshot = pokerEngineAdapter.snapshot(nextState);
  const persistedGame = await repository.startGame({
    gameId,
    expectedVersion,
    currentState: nextState,
    stateSchemaVersion: nextState.stateSchemaVersion,
    handNumber: snapshot.handNumber,
  });

  const projectedState = await withOpenSeatPlaceholders(
    repository,
    gameId,
    nextState,
  );

  return {
    id: persistedGame.id,
    status: persistedGame.status,
    version: persistedGame.version,
    ...publicTimerFields(persistedGame),
    viewerIsHost: true,
    poker: publicProjectionForViewer(
      projectedState,
      callerToken,
      [],
      persistedGame.botsShowUncontestedWins ?? false,
    ),
  };
}

export async function updateSeatCount(
  repository: GameReader & SeatAssignmentRepository & UpdateSeatCountWriter & GameHostReader,
  gameId: string,
  expectedVersion: number,
  seatCount: number,
  callerToken: string,
): Promise<PublicGame> {
  const game = await repository.getGame(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  const state = restorePersistedState(game.currentState);

  try {
    return await updateTableSettings(
      {
        getHostToken: (id) => repository.getHostToken(id),
        getGame: (id) => repository.getGame(id),
        getSeatAssignments: (id) => repository.getSeatAssignments(id),
        updateSeatAssignment: (input) => repository.updateSeatAssignment(input),
        updateTableSettings: (input) => repository.updateSeatCount(input),
      },
      gameId,
      expectedVersion,
      {
        seatCount,
        smallBlind: state.config.smallBlind,
        bigBlind: state.config.bigBlind,
        startingStack:
          state.config.startingStack ??
          state.config.players[0]?.stack ??
          10_000,
        botsShowUncontestedWins: game.botsShowUncontestedWins ?? false,
      },
      callerToken,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Only the host can change table settings"
    ) {
      throw new Error("Only the host can change the seat count");
    }
    throw error;
  }
}

export function validateTableSettings(settings: TableSettings): void {
  if (settings.humanTurnSeconds !== undefined && ![null, 30, 60, 90].includes(settings.humanTurnSeconds)) throw new Error("Invalid human turn timer");
  if (
    !Number.isSafeInteger(settings.seatCount) ||
    settings.seatCount < 2 ||
    settings.seatCount > 6
  ) {
    throw new Error("seatCount must be an integer from 2 through 6");
  }
  if (!Number.isSafeInteger(settings.smallBlind) || settings.smallBlind < 1) {
    throw new Error("smallBlind must be a positive integer");
  }
  if (
    !Number.isSafeInteger(settings.bigBlind) ||
    settings.bigBlind <= settings.smallBlind
  ) {
    throw new Error("bigBlind must be an integer greater than smallBlind");
  }
  if (
    !Number.isSafeInteger(settings.startingStack) ||
    settings.startingStack < settings.bigBlind
  ) {
    throw new Error(
      "startingStack must be an integer at least as large as bigBlind",
    );
  }
}

export async function updateTableSettings(
  repository: GameReader &
    SeatAssignmentRepository &
    UpdateTableSettingsWriter &
    GameHostReader,
  gameId: string,
  expectedVersion: number,
  settings: TableSettings,
  callerToken: string,
): Promise<PublicGame> {
  validateTableSettings(settings);

  const game = await repository.getGame(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  if (game.status !== "waiting") throw new Error("The game is not waiting");
  if (game.version !== expectedVersion) {
    throw new GameConflictError(gameId, expectedVersion);
  }

  const assignments = await repository.getSeatAssignments(gameId);
  if (!(await isCallerHost(repository, gameId, callerToken))) {
    throw new Error("Only the host can change table settings");
  }

  const highestOccupiedSeat = assignments.reduce(
    (highest, assignment) =>
      assignment.status !== "open"
        ? Math.max(highest, assignment.seat)
        : highest,
    -1,
  );
  if (highestOccupiedSeat >= settings.seatCount) {
    throw new Error("Cannot shrink seat count below an occupied seat");
  }

  const state = restorePersistedState(game.currentState);
  const nextState = pokerEngineAdapter.createGame({
    ...state.config,
    ...settings,
    players: state.config.players.map((player) => ({
      ...player,
      stack: settings.startingStack,
    })),
  });

  const persistedGame = await repository.updateTableSettings({
    gameId,
    expectedVersion,
    ...settings,
    currentState: nextState,
    stateSchemaVersion: nextState.stateSchemaVersion,
  });

  const projectedState = await withOpenSeatPlaceholders(
    repository,
    gameId,
    nextState,
  );

  return {
    id: persistedGame.id,
    status: persistedGame.status,
    version: persistedGame.version,
    ...publicTimerFields(persistedGame),
    viewerIsHost: true,
    poker: publicProjectionForViewer(
      projectedState,
      callerToken,
      [],
      persistedGame.botsShowUncontestedWins ?? false,
    ),
  };
}

export async function updatePlayerName(
  repository: SeatAssignmentRepository & GameReader,
  gameId: string,
  seat: number,
  playerToken: string,
  playerName: string,
): Promise<SeatAssignment> {
  const [game, seatAssignments] = await Promise.all([
    repository.getGame(gameId),
    repository.getSeatAssignments(gameId),
  ]);

  if (!game) {
    throw new GameNotFoundError(gameId);
  }

  const assignment = seatAssignments.find((entry) => entry.seat === seat);
  if (!assignment) {
    throw new Error("Seat does not exist");
  }
  if (
    assignment.status !== "claimed" ||
    assignment.controller !== "human" ||
    assignment.playerToken !== playerToken
  ) {
    throw new Error("Seat does not belong to this player");
  }
  if (game.status !== "waiting") {
    throw new Error("Player names can only be changed before the game starts");
  }

  const name = sanitizePlayerName(playerName, `Player ${seat + 1}`);
  const updatedAssignment = { ...assignment, name };
  await repository.updateSeatAssignment({
    gameId,
    seat,
    status: assignment.status,
    name,
  });

  return updatedAssignment;
}

export async function getPublicGame(
  repository: GameSnapshotReader,
  gameId: string,
  viewerPlayerToken?: string | null,
): Promise<PublicGame> {
  const snapshot = await repository.getGameReadSnapshot(gameId);
  if (!snapshot) {
    throw new GameNotFoundError(gameId);
  }
  const { game } = snapshot;
  const state = reconcilePublicSeats(
    gameId,
    restorePersistedState(game.currentState),
    snapshot.assignments,
  );
  const viewerPlayerId =
    viewerPlayerToken === undefined
      ? (state.config.players.find((player) => player.controller === "human")
          ?.id ?? null)
      : typeof viewerPlayerToken === "string"
        ? (state.config.players.find(
            (player) => player.playerToken === viewerPlayerToken,
          )?.id ?? null)
        : null;

  const viewerIsHost =
    snapshot.hostToken !== null &&
    (viewerPlayerToken ?? null) === snapshot.hostToken;
  const listing = viewerIsHost ? snapshot.listing : null;

  return {
    id: game.id,
    status: game.status,
    version: game.version,
    ...publicTimerFields(game),
    viewerIsHost,
    publication: viewerIsHost
      ? {
          isPublic: listing?.isPublic ?? false,
          title: listing?.title ?? null,
          leaseExpiresAt: listing?.hostLeaseExpiresAt ?? "",
        }
      : null,
    poker: {
      ...pokerEngineAdapter.publicProjection(
        state,
        viewerPlayerId,
        snapshot.revealedPlayerIds,
      ),
      botsShowUncontestedWins: game.botsShowUncontestedWins ?? false,
      seats: publicLiveSeats(state, snapshot.assignments, viewerPlayerToken ?? null),
    },
  };
}

/**
 * Simplified action feed for recent hands (optionally from an inclusive hand), for the
 * always-visible player-facing panel. It never exposes hole cards and
 * does not require a viewer token.
 */
export async function getGameFeed(
  repository: GameFeedReader,
  gameId: string,
  sinceHand?: number,
): Promise<PublicGameFeed> {
  const feed = await repository.getGameFeed(gameId, undefined, sinceHand);
  const events: PublicFeedEvent[] = [];

  for (const hand of feed.hands) {
    events.push({ type: "handStarted", handNumber: hand.handNumber });
    const emittedStreets = new Set<(typeof bettingStreets)[number]>();
    const emitStreet = (
      street: (typeof bettingStreets)[number],
      board: readonly string[],
    ) => {
      if (emittedStreets.has(street)) return;
      emittedStreets.add(street);
      events.push({
        type: "street",
        handNumber: hand.handNumber,
        street,
        cards: boardThroughStreet(street, board),
      });
    };

    emitStreet("preflop", []);

    let latestState: PokerGameState | null = null;
    let latestSnapshot: ReturnType<typeof pokerEngineAdapter.snapshot> | null =
      null;
    try {
      if (hand.latestState) {
        latestState = restorePersistedState(hand.latestState);
        latestSnapshot = pokerEngineAdapter.snapshot(latestState);
      }
    } catch {
      // Persisted actions remain useful even if a legacy snapshot is malformed.
    }

    const playerIdBySeat = new Map<number, string>();
    const initialPlayerIds = new Set<string>();
    try {
      const initialState = restorePersistedState(hand.initialState);
      for (const player of initialState.config.players) {
        playerIdBySeat.set(player.seat, player.id);
        initialPlayerIds.add(player.id);
      }
      const playerById = new Map(
        initialState.config.players.map((player) => [player.id, player]),
      );
      for (const posting of pokerEngineAdapter.blindPostings(initialState)) {
        const player = playerById.get(posting.playerId);
        if (!player) continue;
        events.push({
          type: "blind",
          handNumber: hand.handNumber,
          player: player.name,
          playerId: player.id,
          controller: player.controller === "human" ? "human" : "bot",
          blind: posting.blind,
          amount: posting.amount,
        });
      }
    } catch {
      // A malformed legacy snapshot must not hide the persisted action feed.
    }

    for (const action of hand.actions) {
      if (!emittedStreets.has(action.street)) {
        emitStreet(action.street, latestSnapshot?.communityCards ?? []);
      }
      events.push({
        type: "action",
        handNumber: hand.handNumber,
        player: action.player,
        playerId:
          action.seat === null ? null : playerIdBySeat.get(action.seat) ?? null,
        controller: action.controller,
        action: action.action,
        amount: action.amount,
        street: action.street,
      });
    }

    if (latestSnapshot) {
      const revealedStreetCount =
        latestSnapshot.communityCards.length >= 5
          ? 4
          : latestSnapshot.communityCards.length >= 4
            ? 3
            : latestSnapshot.communityCards.length >= 3
              ? 2
              : 1;
      for (const street of bettingStreets.slice(0, revealedStreetCount)) {
        emitStreet(street, latestSnapshot.communityCards);
      }
    }

    if (hand.status !== "complete" || !latestSnapshot || !latestState) continue;

    const nameByPlayerId = new Map(
      latestState.config.players.map((player) => [player.id, player.name]),
    );
    for (const winnerId of latestSnapshot.winnerIds) {
      const amount = latestSnapshot.winnerAmounts[winnerId];
      if (!amount) continue;
      events.push({
        type: "win",
        handNumber: hand.handNumber,
        player: nameByPlayerId.get(winnerId) ?? "Unknown player",
        playerId: initialPlayerIds.has(winnerId) ? winnerId : null,
        amount,
        uncontested: latestSnapshot.completionReason === "fold",
      });
    }
  }

  return { events };
}

export async function submitHumanAction(
  repository: GameReader &
    HumanActionWriter &
    GameHostReader & Partial<SeatAssignmentRepository & HandRevealReader>,
  gameId: string,
  submission: Omit<HumanActionSubmission, "currentVersion">,
): Promise<PublicGame> {
  const game = await repository.getGame(gameId);
  if (!game) {
    throw new GameNotFoundError(gameId);
  }

  const stateBefore = restorePersistedState(game.currentState);
  const snapshotBefore = pokerEngineAdapter.snapshot(stateBefore);
  if (!snapshotBefore.street || snapshotBefore.street === "complete") {
    throw new Error("The current hand is not accepting actions");
  }

  const resolvedPlayerId =
    stateBefore.config.players.find(
      (player) =>
        player.id === submission.playerId ||
        player.playerToken === submission.playerId,
    )?.id ?? submission.playerId;
  let leaving = stateBefore.config.players.find(player => player.id === resolvedPlayerId)?.leaving ?? false;
  if (repository.getSeatAssignments) {
    const seat = (await repository.getSeatAssignments(gameId)).find(player => player.enginePlayerId === resolvedPlayerId);
    if (!seat || seat.status !== "claimed" || seat.playerToken !== submission.playerId) {
      throw new HumanActionError("Seat does not belong to this player");
    }
    leaving = seat.leaving ?? false;
  }
  const action = leaving
    ? { type: "fold" as const } : submission.action;
  const stateAfter = applyHumanAction(stateBefore, {
    ...submission, action,
    playerId: resolvedPlayerId,
    currentVersion: game.version,
  });
  const snapshotAfter = pokerEngineAdapter.snapshot(stateAfter);
  const persistedGame = await repository.persistHumanAction({
    gameId,
    expectedVersion: submission.expectedVersion,
    playerEngineId: resolvedPlayerId,
    currentState: stateAfter,
    stateSchemaVersion: stateAfter.stateSchemaVersion,
    handNumber: snapshotAfter.handNumber,
    status: snapshotAfter.street === "complete" ? "complete" : "playing",
    street: snapshotBefore.street,
    action: action.type,
    amount:
      "amount" in action ? (action.amount ?? null) : null,
    stateBefore,
    handComplete: snapshotAfter.street === "complete",
    ...(() => {
      const autoReveal = autoRevealForCompletedState(
        stateAfter,
        game.botsShowUncontestedWins ?? false,
      );
      return autoReveal
        ? {
            autoRevealPlayerEngineId: autoReveal.playerId,
            autoRevealReason: autoReveal.reason,
          }
        : {};
    })(),
  });

  const projectedState = repository.getSeatAssignments
    ? await withOpenSeatPlaceholders(
        repository as SeatAssignmentRepository,
        gameId,
        stateAfter,
      )
    : stateAfter;

  return {
    id: persistedGame.id,
    status: persistedGame.status,
    version: persistedGame.version,
    ...publicTimerFields(persistedGame),
    viewerIsHost: await isCallerHost(repository, gameId, submission.playerId),
    poker: publicProjectionForViewer(
      projectedState,
      submission.playerId,
      await currentRevealIds(repository, gameId, snapshotAfter.handNumber),
      persistedGame.botsShowUncontestedWins ?? false,
    ),
  };
}

export async function startNextHand(
  repository: GameReader &
    NextHandWriter &
    GameHostReader & Partial<SeatAssignmentRepository & HandRevealReader>,
  gameId: string,
  expectedVersion: number,
  viewerToken: string | null = null,
): Promise<PublicGame> {
  const game = await repository.getGame(gameId);
  if (!game) {
    throw new GameNotFoundError(gameId);
  }
  if (game.version !== expectedVersion) {
    throw new GameConflictError(gameId, expectedVersion);
  }

  const completedState = restorePersistedState(game.currentState);
  const completedSnapshot = pokerEngineAdapter.snapshot(completedState);
  if (completedSnapshot.street !== "complete") {
    throw new Error("The current hand has not completed");
  }

  let nextState = completedState;
  if ("getSeatAssignments" in repository) {
    nextState = await reconcileState(
      repository as unknown as GameReader & SeatAssignmentRepository,
      gameId,
      completedState,
    );
  }
  if (nextState.config.players.length < 2) {
    throw new Error("At least two seats are required");
  }
  nextState = pokerEngineAdapter.startHand(nextState);
  const nextSnapshot = pokerEngineAdapter.snapshot(nextState);
  const persistedGame = await repository.startNextHand({
    gameId,
    expectedVersion,
    currentState: nextState,
    stateSchemaVersion: nextState.stateSchemaVersion,
    handNumber: nextSnapshot.handNumber,
  });

  const projectedState = repository.getSeatAssignments
    ? await withOpenSeatPlaceholders(
        repository as SeatAssignmentRepository,
        gameId,
        nextState,
      )
    : nextState;

  return {
    id: persistedGame.id,
    status: persistedGame.status,
    version: persistedGame.version,
    ...publicTimerFields(persistedGame),
    viewerIsHost: await isCallerHost(repository, gameId, viewerToken),
    poker: publicProjectionForViewer(
      projectedState,
      viewerToken,
      await currentRevealIds(repository, gameId, nextSnapshot.handNumber),
      persistedGame.botsShowUncontestedWins ?? false,
    ),
  };
}

export async function revealHumanCards(
  repository: GameReader &
    HumanRevealWriter &
    GameHostReader & Partial<HandRevealReader & SeatAssignmentRepository>,
  gameId: string,
  expectedVersion: number,
  handNumber: number,
  playerToken: string,
): Promise<PublicGame> {
  const game = await repository.getGame(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  if (game.version !== expectedVersion) {
    throw new GameConflictError(gameId, expectedVersion);
  }

  const state = restorePersistedState(game.currentState);
  const snapshot = pokerEngineAdapter.snapshot(state);
  if (
    snapshot.handNumber !== handNumber ||
    snapshot.street !== "complete" ||
    snapshot.completionReason !== "fold"
  ) {
    throw new Error("Cards can only be shown after a fold-ended hand");
  }

  const player = state.config.players.find(
    (candidate) => candidate.playerToken === playerToken,
  );
  if (!player || player.controller !== "human") {
    throw new Error("Only a participating human can show cards");
  }
  const completedPlayer = (
    state.engineState as {
      hand?: { players?: readonly { playerId: string; holeCards?: unknown }[] };
    }
  ).hand?.players?.find((candidate) => candidate.playerId === player.id);
  if (!completedPlayer?.holeCards) {
    throw new Error("The player was not dealt cards");
  }

  const persistedGame = await repository.revealHumanCards({
    gameId,
    handNumber,
    expectedVersion,
    playerToken,
  });
  const projectedState = repository.getSeatAssignments
    ? await withOpenSeatPlaceholders(
        repository as SeatAssignmentRepository,
        gameId,
        state,
      )
    : state;

  return {
    id: persistedGame.id,
    status: persistedGame.status,
    version: persistedGame.version,
    ...publicTimerFields(persistedGame),
    viewerIsHost: await isCallerHost(repository, gameId, playerToken),
    poker: publicProjectionForViewer(
      projectedState,
      playerToken,
      [player.id, ...(await currentRevealIds(repository, gameId, handNumber))],
      persistedGame.botsShowUncontestedWins ?? false,
    ),
  };
}

/** Prepare exactly one engine action; the departure RPC rechecks identity under lock. */
export function departureFold(game: PersistedGame, actorId: string): DepartureFold {
  const before = restorePersistedState(game.currentState);
  const snapshot = pokerEngineAdapter.snapshot(before);
  if (!snapshot.street || snapshot.street === "complete" || snapshot.currentActorId !== actorId) {
    throw new GameConflictError(game.id, game.version);
  }
  const after = pokerEngineAdapter.applyAction(before, actorId, { type: "fold" });
  const next = pokerEngineAdapter.snapshot(after);
  const reveal = autoRevealForCompletedState(after, game.botsShowUncontestedWins ?? false);
  return { gameId: game.id, expectedVersion: game.version, playerEngineId: actorId,
    currentState: after, stateSchemaVersion: after.stateSchemaVersion, handNumber: next.handNumber,
    status: next.street === "complete" ? "complete" : "playing", street: snapshot.street,
    action: "fold", amount: null, stateBefore: before, handComplete: next.street === "complete",
    ...(reveal ? { autoRevealPlayerEngineId: reveal.playerId, autoRevealReason: reveal.reason } : {}) };
}

export async function advanceDeparture(
  repository: GameReader & GameHostReader & SeatAssignmentRepository & DepartureWriter & Partial<HandRevealReader>,
  gameId: string, expectedVersion: number, viewerToken: string | null,
): Promise<PublicGame> {
  const game = await repository.getGame(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  const state = restorePersistedState(game.currentState);
  await requireBotDriver(repository, gameId, state, viewerToken);
  if (game.version !== expectedVersion) throw new GameConflictError(gameId, expectedVersion);
  const actor = pokerEngineAdapter.snapshot(state).currentActorId;
  const seat = (await repository.getSeatAssignments(gameId)).find(player => player.enginePlayerId === actor);
  if (!actor || !seat || seat.controller !== "human" || seat.status !== "claimed" || !seat.leaving) {
    throw new GameConflictError(gameId, expectedVersion);
  }
  if (!viewerToken) throw new BotStepForbiddenError();
  const fold = departureFold(game, actor);
  const committed = await repository.advanceDepartureIfVersion({ ...fold, driverToken: viewerToken });
  const projected = await withOpenSeatPlaceholders(repository, gameId, restorePersistedState(fold.currentState));
  return { id: committed.id, status: committed.status, version: committed.version, ...publicTimerFields(committed),
    viewerIsHost: await isCallerHost(repository, gameId, viewerToken),
    poker: publicProjectionForViewer(projected, viewerToken,
      await currentRevealIds(repository, gameId, fold.handNumber), committed.botsShowUncontestedWins ?? false) };
}

export async function prepareSeatDeparture(
  repository: GameReader & Pick<SeatAssignmentRepository, "getSeatAssignments"> & GameHostReader,
  input: { gameId: string; seat: number; playerToken: string; expectedVersion: number },
): Promise<DepartureFold | undefined> {
  const game = await repository.getGame(input.gameId);
  if (!game) throw new Error("Seat does not exist");
  if (game.version !== input.expectedVersion) throw new GameConflictError(input.gameId, input.expectedVersion);
  const seat = (await repository.getSeatAssignments(input.gameId)).find(player => player.seat === input.seat);
  if (!seat) throw new Error("Seat does not exist");
  if (seat.playerToken !== input.playerToken && !(await isCallerHost(repository, input.gameId, input.playerToken))) {
    throw new Error("Seat does not belong to this player");
  }
  if (game.status !== "playing" || seat.controller !== "human" || seat.leaving) return;
  const state = restorePersistedState(game.currentState);
  const actor = pokerEngineAdapter.snapshot(state).currentActorId;
  if (actor && actor === seat.enginePlayerId) return departureFold(game, actor);
}

export async function advanceTimeout(
  repository: GameReader & GameHostReader & SeatAssignmentRepository & HandRevealReader & {
    persistTimeout(input: PersistHumanActionInput & { driverToken: string; decisionId: string }): Promise<PersistedGame>;
  }, gameId: string, expectedVersion: number, decisionId: string, viewerToken: string | null,
): Promise<PublicGame> {
  const game = await repository.getGame(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  const before = restorePersistedState(game.currentState);
  await requireBotDriver(repository, gameId, before, viewerToken);
  if (game.version !== expectedVersion || game.turnTimer?.decisionId !== decisionId) throw new GameConflictError(gameId, expectedVersion);
  const snapshot = pokerEngineAdapter.snapshot(before);
  const actor = snapshot.currentActorId;
  const seat = (await repository.getSeatAssignments(gameId)).find(player => player.enginePlayerId === actor);
  if (!actor || actor !== game.turnTimer.actorEngineId || snapshot.handNumber !== game.turnTimer.handNumber ||
      !seat || seat.controller !== "human" || seat.status !== "claimed" || !viewerToken ||
      !snapshot.street || snapshot.street === "complete") throw new GameConflictError(gameId, expectedVersion);
  const action = !seat.leaving && pokerEngineAdapter.getLegalActions(before).some(action => action.type === "check")
    ? { type: "check" as const } : { type: "fold" as const };
  const after = pokerEngineAdapter.applyAction(before, actor, action);
  const next = pokerEngineAdapter.snapshot(after);
  const reveal = autoRevealForCompletedState(after, game.botsShowUncontestedWins ?? false);
  const committed = await repository.persistTimeout({ gameId, expectedVersion, decisionId, driverToken: viewerToken,
    playerEngineId: actor, currentState: after, stateSchemaVersion: after.stateSchemaVersion, handNumber: next.handNumber,
    status: next.street === "complete" ? "complete" : "playing", street: snapshot.street,
    action: action.type, amount: null, stateBefore: before, handComplete: next.street === "complete",
    ...(reveal ? { autoRevealPlayerEngineId: reveal.playerId, autoRevealReason: reveal.reason } : {}) });
  const projected = await withOpenSeatPlaceholders(repository, gameId, after);
  return { id: committed.id, status: committed.status, version: committed.version, ...publicTimerFields(committed),
    viewerIsHost: await isCallerHost(repository, gameId, viewerToken),
    poker: publicProjectionForViewer(projected, viewerToken, await currentRevealIds(repository, gameId, next.handNumber),
      committed.botsShowUncontestedWins ?? false) };
}
