import { pokerEngineAdapter } from "./adapter";
import { createPokerAIState } from "./ai-state";
import { createSizingOptions } from "@/lib/typesafe/questions";
import { applyHumanAction, type HumanActionSubmission } from "./human-actions";
import type {
  AIDifficulty,
  BotDescriptor,
  GameConfig,
  PokerGameState,
  PublicPokerGame,
  PokerPlayerConfig,
  TableSettings,
} from "./types";
import type {
  CreateGameSessionInput,
  GameFeed,
  PersistAIActionInput,
  PersistHumanActionInput,
  PersistedGame,
  StartNextHandInput,
  UpdateSeatCountInput,
} from "@/lib/supabase/queries";
import { GameConflictError } from "@/lib/supabase/queries";
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";
import { JevPokerBot } from "@/lib/bots/jev";
import type { BotRegistry } from "@/lib/bots/registry";
import type { PokerBot } from "@/lib/bots/types";

export interface CreateDemoGameOptions {
  readonly seatCount?: number;
  readonly smallBlind?: number;
  readonly bigBlind?: number;
  readonly startingStack?: number;
  readonly hostToken?: string;
  readonly hostName?: string;
}

const maxPlayerNameLength = 30;

function sanitizePlayerName(
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
    smallBlind,
    bigBlind,
    startingStack,
    seatCount,
    players: [
      {
        id: "human",
        seat: 0,
        name: sanitizePlayerName(options.hostName, "You"),
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

export interface GameSessionWriter {
  createGameSession(input: CreateGameSessionInput): Promise<PersistedGame>;
}

export interface GameReader {
  getGame(gameId: string): Promise<PersistedGame | null>;
}

export interface HandRevealReader {
  getCurrentHandRevealedPlayerIds(
    gameId: string,
    handNumber: number,
  ): Promise<readonly string[]>;
}

export interface HumanRevealWriter {
  revealHumanCards(input: {
    readonly gameId: string;
    readonly handNumber: number;
    readonly expectedVersion: number;
    readonly playerToken: string;
  }): Promise<PersistedGame>;
}

export interface GameHostReader {
  getHostToken(gameId: string): Promise<string | null>;
}

export type SeatStatus = "open" | "claimed" | "bot";

export interface SeatAssignment {
  readonly gameId: string;
  readonly seat: number;
  readonly name?: string;
  readonly status: SeatStatus;
  readonly controller: "human" | "bot";
  readonly bot?: BotDescriptor | null;
  readonly aiDifficulty?: AIDifficulty | null;
  readonly playerToken: string | null;
  readonly isHost: boolean;
  readonly leaving?: boolean;
  readonly enginePlayerId?: string | null;
}

export interface SeatAssignmentRepository {
  getSeatAssignments(gameId: string): Promise<readonly SeatAssignment[]>;
  updateSeatAssignment(input: {
    readonly gameId: string;
    readonly seat: number;
    readonly status: SeatStatus;
    readonly name?: string;
    readonly controller?: "human" | "bot";
    readonly bot?: BotDescriptor | null;
    readonly aiDifficulty?: AIDifficulty | null;
    readonly playerToken?: string | null;
    readonly isHost?: boolean;
    readonly leaving?: boolean;
    readonly enginePlayerId?: string | null;
  }): Promise<void>;
}

export interface HumanActionWriter {
  persistHumanAction(input: PersistHumanActionInput): Promise<PersistedGame>;
}

export interface AIActionWriter {
  persistAIAction(input: PersistAIActionInput): Promise<PersistedGame>;
}

export interface HandHistoryReader {
  getHandHistory(
    gameId: string,
    handNumber: number,
  ): Promise<import("@/lib/supabase/queries").HandHistory | null>;
}

export interface GameFeedReader {
  getGameFeed(gameId: string): Promise<GameFeed>;
}

export type PublicFeedEvent =
  | { readonly type: "handStarted"; readonly handNumber: number }
  | {
      readonly type: "action";
      readonly handNumber: number;
      readonly player: string;
      readonly controller: "human" | "bot";
      readonly action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
      readonly amount: number | null;
      readonly street: "preflop" | "flop" | "turn" | "river";
    }
  | {
      readonly type: "board";
      readonly handNumber: number;
      readonly cards: readonly string[];
    }
  | {
      readonly type: "win";
      readonly handNumber: number;
      readonly player: string;
      readonly amount: number;
      readonly uncontested: boolean;
    };

export interface PublicGameFeed {
  readonly events: readonly PublicFeedEvent[];
}

export interface NextHandWriter {
  startNextHand(input: StartNextHandInput): Promise<PersistedGame>;
}

export interface StartGameWriter {
  startGame(input: StartNextHandInput): Promise<PersistedGame>;
}

export interface UpdateSeatCountWriter {
  updateSeatCount(input: UpdateSeatCountInput): Promise<PersistedGame>;
}

export interface UpdateTableSettingsWriter {
  updateTableSettings(
    input: UpdateSeatCountInput & TableSettings,
  ): Promise<PersistedGame>;
}

export interface CreatedGame {
  readonly gameId: string;
  readonly state: PokerGameState;
  readonly version: number;
}

export interface PublicGame {
  readonly id: string;
  readonly status: PersistedGame["status"];
  readonly version: number;
  readonly viewerIsHost: boolean;
  readonly poker: PublicPokerGame;
}

export interface PublicAIDecision {
  readonly action: "fold" | "check" | "call" | "bet" | "raise";
  readonly amount: number | null;
  readonly bot: BotDescriptor;
  readonly probabilities: Readonly<Record<string, number>> | null;
  readonly confidence: number | null;
  readonly sizing: {
    readonly choice: import("@/lib/typesafe/questions").SizingChoice;
    readonly probabilities: Readonly<Record<string, number>> | null;
    readonly confidence: number | null;
  } | null;
  readonly matchedRule: string | null;
}

export interface BotStepResult {
  readonly game: PublicGame;
  readonly aiDecision: PublicAIDecision;
}

export type TypesafeStepResult = BotStepResult;

export class GameNotFoundError extends Error {
  constructor(gameId: string) {
    super(`Game not found: ${gameId}`);
    this.name = "GameNotFoundError";
  }
}

function restorePersistedState(raw: unknown): PokerGameState {
  if (!raw || typeof raw !== "object") {
    throw new Error("Malformed persisted game state");
  }
  const state = raw as Record<string, unknown>;
  if (state.stateSchemaVersion !== 1) {
    throw new Error("Malformed persisted game state");
  }
  try {
    return pokerEngineAdapter.restore(state as unknown as PokerGameState);
  } catch {
    throw new Error("Malformed persisted game state");
  }
}

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

async function isCallerHost(
  repository: Partial<GameHostReader>,
  gameId: string,
  callerToken: string | null,
  assignments: readonly SeatAssignment[] = [],
): Promise<boolean> {
  if (repository.getHostToken) {
    const hostToken = await repository.getHostToken(gameId);
    return hostToken !== null && callerToken === hostToken;
  }
  const hostAssignments = assignments.filter((assignment) => assignment.isHost);
  return (
    hostAssignments.length === 0 ||
    hostAssignments.some((assignment) => assignment.playerToken === callerToken)
  );
}

function enginePlayerIdForAssignment(
  gameId: string,
  assignment: SeatAssignment,
): string {
  return (
    assignment.enginePlayerId ??
    `${assignment.status === "bot" ? "bot" : "player"}-${gameId}-${assignment.seat}`
  );
}

function playerConfigForAssignment(
  gameId: string,
  assignment: SeatAssignment,
  startingStack: number,
): PokerPlayerConfig {
  return {
    id: enginePlayerIdForAssignment(gameId, assignment),
    seat: assignment.seat,
    name:
      assignment.name ??
      (assignment.status === "bot"
        ? (assignment.bot?.label ?? "TypeSafe Jev")
        : `Player ${assignment.seat + 1}`),
    controller: assignment.controller,
    bot: assignment.controller === "bot" ? assignment.bot : null,
    aiDifficulty:
      assignment.bot?.provider === "typesafe"
        ? (assignment.aiDifficulty ?? "medium")
        : null,
    stack: startingStack,
    status: assignment.status,
    playerToken: assignment.playerToken,
    isHost: assignment.isHost,
    leaving: assignment.leaving ?? false,
  };
}

async function withOpenSeatPlaceholders(
  repository: SeatAssignmentRepository,
  gameId: string,
  state: PokerGameState,
): Promise<PokerGameState> {
  const assignments = await repository.getSeatAssignments(gameId);
  const startingStack =
    state.config.startingStack ?? state.config.players[0]?.stack ?? 10_000;
  const assignmentsById = new Map(
    assignments
      .filter((assignment) => assignment.enginePlayerId)
      .map((assignment) => [assignment.enginePlayerId, assignment]),
  );
  const assignmentsBySeat = new Map(
    assignments.map((assignment) => [assignment.seat, assignment]),
  );
  const configuredPlayerIds = new Set(
    state.config.players.map((player) => player.id),
  );
  const players = state.config.players.map((player) => {
    const assignment =
      assignmentsById.get(player.id) ?? assignmentsBySeat.get(player.seat);
    return assignment
      ? {
          ...player,
          seat: assignment.seat,
          name: assignment.name ?? player.name,
          controller: assignment.controller,
          bot: assignment.controller === "bot" ? assignment.bot : null,
          aiDifficulty:
            assignment.bot?.provider === "typesafe"
              ? (assignment.aiDifficulty ?? "medium")
              : null,
          status: assignment.status,
          playerToken: assignment.playerToken,
          isHost: assignment.isHost,
          leaving: assignment.leaving ?? false,
        }
      : player;
  });
  const configuredSeats = new Set(players.map((player) => player.seat));
  for (const assignment of assignments) {
    if (
      assignment.enginePlayerId &&
      configuredPlayerIds.has(assignment.enginePlayerId)
    ) {
      continue;
    }
    if (configuredSeats.has(assignment.seat)) continue;
    players.push(playerConfigForAssignment(gameId, assignment, startingStack));
    configuredSeats.add(assignment.seat);
  }
  return {
    ...state,
    config: {
      ...state.config,
      players,
    },
  };
}

async function reconcileState(
  repository: SeatAssignmentRepository,
  gameId: string,
  state: PokerGameState,
): Promise<PokerGameState> {
  const assignments = await Promise.all(
    (await repository.getSeatAssignments(gameId)).map(async (assignment) => {
      if (!assignment.leaving) return assignment;

      const openAssignment: SeatAssignment = {
        ...assignment,
        name: `Seat ${assignment.seat + 1}`,
        status: "open",
        controller: "human",
        bot: null,
        aiDifficulty: null,
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
              aiDifficulty:
                assignment.bot?.provider === "typesafe"
                  ? (assignment.aiDifficulty ?? "medium")
                  : null,
            }
          : player;
      }),
    },
  };
}

function publicProjectionForViewer(
  state: PokerGameState,
  viewerToken: string | null,
  revealedPlayerIds: readonly string[] = [],
  botsShowUncontestedWins = false,
): PublicPokerGame {
  const viewerPlayerId = viewerToken
    ? (state.config.players.find(
        (player) =>
          player.playerToken === viewerToken || player.id === viewerToken,
      )?.id ?? null)
    : null;
  return {
    ...pokerEngineAdapter.publicProjection(
      state,
      viewerPlayerId,
      revealedPlayerIds,
    ),
    botsShowUncontestedWins,
  };
}

async function currentRevealIds(
  repository: Partial<HandRevealReader>,
  gameId: string,
  handNumber: number,
): Promise<readonly string[]> {
  return repository.getCurrentHandRevealedPlayerIds
    ? repository.getCurrentHandRevealedPlayerIds(gameId, handNumber)
    : [];
}

function autoRevealForCompletedState(
  state: PokerGameState,
  botsShowUncontestedWins: boolean,
): { playerId: string; reason: "bot_uncontested" } | null {
  const snapshot = pokerEngineAdapter.snapshot(state);
  if (!botsShowUncontestedWins || snapshot.completionReason !== "fold") {
    return null;
  }
  if (snapshot.winnerIds.length !== 1) return null;
  const winner = state.config.players.find(
    (player) => player.id === snapshot.winnerIds[0],
  );
  return winner && winner.controller !== "human"
    ? { playerId: winner.id, reason: "bot_uncontested" }
    : null;
}

export async function startGame(
  repository: GameReader &
    SeatAssignmentRepository &
    StartGameWriter &
    Partial<GameHostReader>,
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
  if (!(await isCallerHost(repository, gameId, callerToken, assignments))) {
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
  repository: GameReader & SeatAssignmentRepository & UpdateSeatCountWriter,
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
    Partial<GameHostReader>,
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
  if (!(await isCallerHost(repository, gameId, callerToken, assignments))) {
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
    viewerIsHost: true,
    poker: publicProjectionForViewer(
      projectedState,
      callerToken,
      [],
      persistedGame.botsShowUncontestedWins ?? false,
    ),
  };
}

export async function claimSeat(
  repository: SeatAssignmentRepository,
  gameId: string,
  seat: number,
  playerToken: string,
  playerName?: string,
): Promise<SeatAssignment> {
  const seatAssignments = await repository.getSeatAssignments(gameId);
  const assignment = seatAssignments.find((entry) => entry.seat === seat);

  if (!assignment) {
    throw new Error("Seat does not exist");
  }
  if (assignment.status !== "open") {
    throw new Error("Seat is not open");
  }
  const existingClaim = seatAssignments.find(
    (entry) => entry.status === "claimed" && entry.playerToken === playerToken,
  );

  const name = sanitizePlayerName(
    playerName,
    existingClaim?.name ?? `Player ${seat + 1}`,
  );

  if (existingClaim) {
    await repository.updateSeatAssignment({
      gameId,
      seat: existingClaim.seat,
      status: "open",
      name: `Seat ${existingClaim.seat + 1}`,
      controller: "human",
      bot: null,
      aiDifficulty: null,
      playerToken: null,
      isHost: false,
      leaving: false,
      enginePlayerId: null,
    });
  }

  const updatedAssignment: SeatAssignment = {
    ...assignment,
    status: "claimed",
    controller: "human",
    name,
    playerToken,
    isHost: existingClaim?.isHost ?? false,
    enginePlayerId:
      existingClaim?.enginePlayerId ??
      assignment.enginePlayerId ??
      `seat-${gameId}-${seat}`,
  };

  await repository.updateSeatAssignment({
    gameId,
    seat,
    status: "claimed",
    controller: "human",
    name,
    playerToken,
    isHost: updatedAssignment.isHost,
    enginePlayerId: updatedAssignment.enginePlayerId,
  });

  return updatedAssignment;
}

export async function assignBotToSeat(
  repository: SeatAssignmentRepository & Partial<GameHostReader>,
  gameId: string,
  seat: number,
  hostToken: string,
  difficulty: AIDifficulty = "medium",
  bot: BotDescriptor = {
    id: "jev",
    label: "TypeSafe Jev",
    provider: "typesafe",
    modelId: "jev-latest",
  },
): Promise<SeatAssignment> {
  const seatAssignments = await repository.getSeatAssignments(gameId);
  const assignment = seatAssignments.find((entry) => entry.seat === seat);

  if (!(await isCallerHost(repository, gameId, hostToken, seatAssignments))) {
    throw new Error("Only the host can assign bots");
  }
  if (!assignment) {
    throw new Error("Seat does not exist");
  }
  if (assignment.status !== "open") {
    throw new Error("Seat is not open");
  }

  const existingBotCount = seatAssignments.filter(
    (entry) => entry.status === "bot",
  ).length;
  const name = `${bot.label} #${existingBotCount + 1}`;

  const updatedAssignment: SeatAssignment = {
    ...assignment,
    status: "bot",
    controller: "bot",
    bot,
    aiDifficulty: bot.provider === "typesafe" ? difficulty : null,
    name,
    playerToken: null,
    isHost: false,
    enginePlayerId: assignment.enginePlayerId ?? `bot-${gameId}-${seat}`,
  };

  await repository.updateSeatAssignment({
    gameId,
    seat,
    status: "bot",
    controller: "bot",
    bot,
    aiDifficulty: bot.provider === "typesafe" ? difficulty : null,
    name,
    playerToken: null,
    isHost: false,
    enginePlayerId: updatedAssignment.enginePlayerId,
  });

  return updatedAssignment;
}

export async function releaseSeat(
  repository: SeatAssignmentRepository & Partial<GameReader & GameHostReader>,
  gameId: string,
  seat: number,
  playerToken: string,
): Promise<SeatAssignment> {
  const seatAssignments = await repository.getSeatAssignments(gameId);
  const assignment = seatAssignments.find((entry) => entry.seat === seat);

  if (!assignment) {
    throw new Error("Seat does not exist");
  }

  const isHostRelease = await isCallerHost(
    repository,
    gameId,
    playerToken,
    seatAssignments,
  );
  const isSelfRelease = assignment.playerToken === playerToken;
  if (!isHostRelease && !isSelfRelease) {
    throw new Error("Seat does not belong to this player");
  }

  let isHandInProgress = false;
  if (repository.getGame) {
    const game = await repository.getGame(gameId);
    if (game) {
      const snapshot = pokerEngineAdapter.snapshot(
        restorePersistedState(game.currentState),
      );
      isHandInProgress = Boolean(
        snapshot.street && snapshot.street !== "complete",
      );
    }
  }
  const updatedAssignment: SeatAssignment = {
    ...assignment,
    status: isHandInProgress ? assignment.status : "open",
    name: isHandInProgress ? assignment.name : `Seat ${seat + 1}`,
    controller: isHandInProgress ? assignment.controller : "human",
    bot: isHandInProgress ? assignment.bot : null,
    aiDifficulty: isHandInProgress ? assignment.aiDifficulty : null,
    playerToken: isHandInProgress ? assignment.playerToken : null,
    isHost: false,
    leaving: isHandInProgress,
  };

  await repository.updateSeatAssignment({
    gameId,
    seat,
    status: updatedAssignment.status,
    name: updatedAssignment.name,
    controller: updatedAssignment.controller,
    bot: updatedAssignment.bot,
    aiDifficulty: updatedAssignment.aiDifficulty,
    playerToken: updatedAssignment.playerToken,
    isHost: false,
    leaving: updatedAssignment.leaving,
  });

  return updatedAssignment;
}

export async function getPublicGame(
  repository: GameReader &
    Partial<GameHostReader & SeatAssignmentRepository & HandRevealReader>,
  gameId: string,
  viewerPlayerToken?: string | null,
): Promise<PublicGame> {
  const game = await repository.getGame(gameId);
  if (!game) {
    throw new GameNotFoundError(gameId);
  }

  let state = restorePersistedState(game.currentState);
  if ("getSeatAssignments" in repository) {
    state = await withOpenSeatPlaceholders(
      repository as GameReader & SeatAssignmentRepository,
      gameId,
      state,
    );
  }
  const viewerPlayerId =
    viewerPlayerToken === undefined
      ? (state.config.players.find((player) => player.controller === "human")
          ?.id ?? null)
      : typeof viewerPlayerToken === "string"
        ? (state.config.players.find(
            (player) => player.playerToken === viewerPlayerToken,
          )?.id ?? null)
        : null;

  return {
    id: game.id,
    status: game.status,
    version: game.version,
    viewerIsHost: await isCallerHost(
      repository,
      gameId,
      viewerPlayerToken ?? null,
    ),
    poker: {
      ...pokerEngineAdapter.publicProjection(
        state,
        viewerPlayerId,
        await currentRevealIds(repository, gameId, game.handNumber),
      ),
      botsShowUncontestedWins: game.botsShowUncontestedWins ?? false,
    },
  };
}

/**
 * Simplified action feed spanning every hand played so far, for the
 * always-visible player-facing panel. Unlike `getHandHistory`, it carries no
 * bot inspection detail and never needs a viewer token, since it never
 * exposes hole cards.
 */
export async function getGameFeed(
  repository: GameFeedReader,
  gameId: string,
): Promise<PublicGameFeed> {
  const feed = await repository.getGameFeed(gameId);
  const events: PublicFeedEvent[] = [];

  for (const hand of feed.hands) {
    events.push({ type: "handStarted", handNumber: hand.handNumber });

    for (const action of hand.actions) {
      events.push({
        type: "action",
        handNumber: hand.handNumber,
        player: action.player,
        controller: action.controller,
        action: action.action,
        amount: action.amount,
        street: action.street,
      });
    }

    if (hand.status !== "complete" || !hand.finalState) {
      continue;
    }

    let state: PokerGameState;
    let snapshot: ReturnType<typeof pokerEngineAdapter.snapshot>;
    try {
      state = restorePersistedState(hand.finalState);
      snapshot = pokerEngineAdapter.snapshot(state);
    } catch {
      continue;
    }

    if (snapshot.communityCards.length > 0) {
      events.push({
        type: "board",
        handNumber: hand.handNumber,
        cards: snapshot.communityCards,
      });
    }

    const nameByPlayerId = new Map(
      state.config.players.map((player) => [player.id, player.name]),
    );
    for (const winnerId of snapshot.winnerIds) {
      const amount = snapshot.winnerAmounts[winnerId];
      if (!amount) continue;
      events.push({
        type: "win",
        handNumber: hand.handNumber,
        player: nameByPlayerId.get(winnerId) ?? "Unknown player",
        amount,
        uncontested: snapshot.completionReason === "fold",
      });
    }
  }

  return { events };
}

export async function submitHumanAction(
  repository: GameReader &
    HumanActionWriter &
    Partial<SeatAssignmentRepository & GameHostReader & HandRevealReader>,
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
  const stateAfter = applyHumanAction(stateBefore, {
    ...submission,
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
    action: submission.action.type,
    amount:
      "amount" in submission.action ? (submission.action.amount ?? null) : null,
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
    viewerIsHost: await isCallerHost(repository, gameId, submission.playerId),
    poker: publicProjectionForViewer(
      projectedState,
      submission.playerId,
      await currentRevealIds(repository, gameId, snapshotAfter.handNumber),
      persistedGame.botsShowUncontestedWins ?? false,
    ),
  };
}

async function stepResolvedBotAction(
  repository: GameReader &
    AIActionWriter &
    Partial<
      SeatAssignmentRepository &
        HandHistoryReader &
        GameHostReader &
        HandRevealReader
    >,
  bot: PokerBot,
  botDescriptor: BotDescriptor,
  gameId: string,
  expectedVersion: number,
  viewerToken: string | null = null,
): Promise<BotStepResult> {
  const game = await repository.getGame(gameId);
  if (!game) {
    throw new GameNotFoundError(gameId);
  }
  if (game.version !== expectedVersion) {
    throw new GameConflictError(gameId, expectedVersion);
  }

  const stateBefore = restorePersistedState(game.currentState);
  const snapshotBefore = pokerEngineAdapter.snapshot(stateBefore);
  const botPlayer = stateBefore.config.players.find(
    (player) => player.id === snapshotBefore.currentActorId,
  );
  if (!botPlayer || botPlayer.controller === "human") {
    throw new Error("It is not a bot turn");
  }
  if (!snapshotBefore.street || snapshotBefore.street === "complete") {
    throw new Error("The current hand is not accepting actions");
  }

  const history = repository.getHandHistory
    ? await repository.getHandHistory(gameId, snapshotBefore.handNumber)
    : null;
  const aiState = createPokerAIState(stateBefore, botPlayer.id, {
    difficulty: botPlayer.aiDifficulty ?? "medium",
    actionHistory: history?.actions ?? [],
  });
  const context = { ...aiState, sizingOptions: createSizingOptions(aiState) };
  const decision = await bot.decide(context);
  const stateAfter = pokerEngineAdapter.applyAction(
    stateBefore,
    botPlayer.id,
    decision.action,
  );
  const snapshotAfter = pokerEngineAdapter.snapshot(stateAfter);
  const persistedGame = await repository.persistAIAction({
    gameId,
    expectedVersion,
    playerEngineId: botPlayer.id,
    currentState: stateAfter,
    stateSchemaVersion: stateAfter.stateSchemaVersion,
    handNumber: snapshotAfter.handNumber,
    status: snapshotAfter.street === "complete" ? "complete" : "playing",
    street: snapshotBefore.street,
    action: decision.action.type,
    amount:
      "amount" in decision.action ? (decision.action.amount ?? null) : null,
    stateBefore,
    handComplete: snapshotAfter.street === "complete",
    aiState,
    legalActions: aiState.legalActions,
    choice: decision.action.type,
    bot: botDescriptor,
    probabilities: decision.diagnostics.probabilities,
    confidence: decision.diagnostics.confidence,
    raiseSizeChoice: decision.diagnostics.sizing?.choice ?? null,
    raiseSizeProbabilities: decision.diagnostics.sizing?.probabilities ?? null,
    matchedRule: decision.diagnostics.matchedRule,
    promptVersion: decision.diagnostics.promptVersion,
    durationMs: decision.diagnostics.durationMs,
    usage: decision.diagnostics.usage,
    cost: decision.diagnostics.cost,
    rawResponse: decision.rawResponse,
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
    game: {
      id: persistedGame.id,
      status: persistedGame.status,
      version: persistedGame.version,
      viewerIsHost: await isCallerHost(repository, gameId, viewerToken),
      poker: publicProjectionForViewer(
        projectedState,
        viewerToken,
        await currentRevealIds(repository, gameId, snapshotAfter.handNumber),
        persistedGame.botsShowUncontestedWins ?? false,
      ),
    },
    aiDecision: {
      action: decision.action.type,
      amount:
        "amount" in decision.action ? (decision.action.amount ?? null) : null,
      bot: botDescriptor,
      probabilities: decision.diagnostics.probabilities,
      confidence: decision.diagnostics.confidence,
      sizing: decision.diagnostics.sizing,
      matchedRule: decision.diagnostics.matchedRule,
    },
  };
}

export async function stepBotAction(
  repository: Parameters<typeof stepResolvedBotAction>[0],
  registry: BotRegistry,
  gameId: string,
  expectedVersion: number,
  viewerToken: string | null = null,
): Promise<BotStepResult> {
  const game = await repository.getGame(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  if (game.version !== expectedVersion) {
    throw new GameConflictError(gameId, expectedVersion);
  }
  const state = restorePersistedState(game.currentState);
  const actorId = pokerEngineAdapter.snapshot(state).currentActorId;
  const player = state.config.players.find(
    (candidate) => candidate.id === actorId,
  );
  if (!player || player.controller === "human") {
    throw new Error("It is not a bot turn");
  }
  const botId = player.bot?.id ?? "jev";
  const resolved = registry.get(botId);
  return stepResolvedBotAction(
    repository,
    resolved.bot,
    resolved.descriptor,
    gameId,
    expectedVersion,
    viewerToken,
  );
}

/** Legacy test seam retained while callers migrate to the bot registry. */
export async function stepTypesafeAction(
  repository: Parameters<typeof stepResolvedBotAction>[0],
  client: TypesafeDecisionClient,
  gameId: string,
  viewerToken: string | null = null,
): Promise<BotStepResult> {
  const game = await repository.getGame(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  return stepResolvedBotAction(
    repository,
    new JevPokerBot(client),
    {
      id: "jev",
      label: "TypeSafe Jev",
      provider: "typesafe",
      modelId: "jev-latest",
    },
    gameId,
    game.version,
    viewerToken,
  );
}

export async function startNextHand(
  repository: GameReader &
    NextHandWriter &
    Partial<SeatAssignmentRepository & GameHostReader & HandRevealReader>,
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
    Partial<HandRevealReader & SeatAssignmentRepository & GameHostReader>,
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
    viewerIsHost: await isCallerHost(repository, gameId, playerToken),
    poker: publicProjectionForViewer(
      projectedState,
      playerToken,
      [player.id, ...(await currentRevealIds(repository, gameId, handNumber))],
      persistedGame.botsShowUncontestedWins ?? false,
    ),
  };
}
