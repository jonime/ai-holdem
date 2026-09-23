import { pokerEngineAdapter } from "./adapter";
import { createPokerAIState } from "./ai-state";
import { applyHumanAction, type HumanActionSubmission } from "./human-actions";
import type {
  AIDifficulty,
  GameConfig,
  PokerGameState,
  PublicPokerGame,
  PokerPlayerConfig,
  TableSettings,
} from "./types";
import type {
  CreateGameSessionInput,
  PersistAIActionInput,
  PersistHumanActionInput,
  PersistedGame,
  StartNextHandInput,
  UpdateSeatCountInput,
} from "@/lib/supabase/queries";
import { GameConflictError } from "@/lib/supabase/queries";
import {
  decidePokerAction,
  type TypesafeDecisionClient,
} from "@/lib/typesafe/decision";

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

export interface GameHostReader {
  getHostToken(gameId: string): Promise<string | null>;
}

export type SeatStatus = "open" | "claimed" | "bot";

export interface SeatAssignment {
  readonly gameId: string;
  readonly seat: number;
  readonly name?: string;
  readonly status: SeatStatus;
  readonly controller: "human" | "typesafe_ai";
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
    readonly controller?: "human" | "typesafe_ai";
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
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number;
  readonly sizing: {
    readonly choice: import("@/lib/typesafe/questions").SizingChoice;
    readonly probabilities: Readonly<Record<string, number>>;
    readonly confidence: number;
  } | null;
}

export interface TypesafeStepResult {
  readonly game: PublicGame;
  readonly aiDecision: PublicAIDecision;
}

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
        ? "TypeSafe AI"
        : `Player ${assignment.seat + 1}`),
    controller: assignment.controller,
    aiDifficulty:
      assignment.controller === "typesafe_ai"
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
  const configuredSeats = new Set(
    state.config.players.map((player) => player.seat),
  );
  const players = [...state.config.players];
  const startingStack =
    state.config.startingStack ?? state.config.players[0]?.stack ?? 10_000;
  for (const assignment of assignments) {
    if (configuredSeats.has(assignment.seat)) continue;
    players.push(playerConfigForAssignment(gameId, assignment, startingStack));
  }
  const assignmentsById = new Map(
    assignments
      .filter((assignment) => assignment.enginePlayerId)
      .map((assignment) => [assignment.enginePlayerId, assignment]),
  );
  return {
    ...state,
    config: {
      ...state.config,
      players: players.map((player) => {
        const assignment = assignmentsById.get(player.id);
        return assignment
          ? {
              ...player,
              name: assignment.name ?? player.name,
              controller: assignment.controller,
              aiDifficulty:
                assignment.controller === "typesafe_ai"
                  ? (assignment.aiDifficulty ?? "medium")
                  : null,
              status: assignment.status,
              playerToken: assignment.playerToken,
              isHost: assignment.isHost,
              leaving: assignment.leaving ?? false,
            }
          : player;
      }),
    },
  };
}

async function reconcileState(
  repository: SeatAssignmentRepository,
  gameId: string,
  state: PokerGameState,
): Promise<PokerGameState> {
  const assignments = await repository.getSeatAssignments(gameId);
  const startingStack =
    state.config.startingStack ?? state.config.players[0]?.stack ?? 10_000;
  const filled = assignments.filter(
    (assignment) =>
      (assignment.status === "claimed" || assignment.status === "bot") &&
      !assignment.leaving,
  );
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
              aiDifficulty:
                assignment.controller === "typesafe_ai"
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
): PublicPokerGame {
  const viewerPlayerId = viewerToken
    ? (state.config.players.find((player) => player.playerToken === viewerToken)
        ?.id ?? null)
    : null;
  return pokerEngineAdapter.publicProjection(state, viewerPlayerId);
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
    poker: publicProjectionForViewer(projectedState, callerToken),
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
    poker: publicProjectionForViewer(projectedState, callerToken),
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

  const name = sanitizePlayerName(playerName, `Player ${seat + 1}`);

  const updatedAssignment: SeatAssignment = {
    ...assignment,
    status: "claimed",
    controller: "human",
    name,
    playerToken,
    isHost: false,
    enginePlayerId: assignment.enginePlayerId ?? `seat-${gameId}-${seat}`,
  };

  await repository.updateSeatAssignment({
    gameId,
    seat,
    status: "claimed",
    controller: "human",
    name,
    playerToken,
    isHost: false,
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
  const name = `TypeSafe AI #${existingBotCount + 1}`;

  const updatedAssignment: SeatAssignment = {
    ...assignment,
    status: "bot",
    controller: "typesafe_ai",
    aiDifficulty: difficulty,
    name,
    playerToken: null,
    isHost: false,
    enginePlayerId: assignment.enginePlayerId ?? `bot-${gameId}-${seat}`,
  };

  await repository.updateSeatAssignment({
    gameId,
    seat,
    status: "bot",
    controller: "typesafe_ai",
    aiDifficulty: difficulty,
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
    controller: isHandInProgress ? assignment.controller : "human",
    aiDifficulty: isHandInProgress ? assignment.aiDifficulty : null,
    playerToken: isHandInProgress ? assignment.playerToken : null,
    isHost: false,
    leaving: isHandInProgress,
  };

  await repository.updateSeatAssignment({
    gameId,
    seat,
    status: updatedAssignment.status,
    controller: updatedAssignment.controller,
    aiDifficulty: updatedAssignment.aiDifficulty,
    playerToken: updatedAssignment.playerToken,
    isHost: false,
    leaving: updatedAssignment.leaving,
  });

  return updatedAssignment;
}

export async function getPublicGame(
  repository: GameReader & Partial<GameHostReader & SeatAssignmentRepository>,
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
    poker: pokerEngineAdapter.publicProjection(state, viewerPlayerId),
  };
}

export async function submitHumanAction(
  repository: GameReader &
    HumanActionWriter &
    Partial<SeatAssignmentRepository & GameHostReader>,
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
    poker: pokerEngineAdapter.publicProjection(
      projectedState,
      resolvedPlayerId,
    ),
  };
}

export async function stepTypesafeAction(
  repository: GameReader &
    AIActionWriter &
    Partial<SeatAssignmentRepository & HandHistoryReader & GameHostReader>,
  client: TypesafeDecisionClient,
  gameId: string,
  viewerToken: string | null = null,
): Promise<TypesafeStepResult> {
  const game = await repository.getGame(gameId);
  if (!game) {
    throw new GameNotFoundError(gameId);
  }

  const stateBefore = restorePersistedState(game.currentState);
  const snapshotBefore = pokerEngineAdapter.snapshot(stateBefore);
  const aiPlayer = stateBefore.config.players.find(
    (player) => player.id === snapshotBefore.currentActorId,
  );
  if (!aiPlayer || aiPlayer.controller !== "typesafe_ai") {
    throw new Error("It is not a TypeSafe AI turn");
  }
  if (!snapshotBefore.street || snapshotBefore.street === "complete") {
    throw new Error("The current hand is not accepting actions");
  }

  const history = repository.getHandHistory
    ? await repository.getHandHistory(gameId, snapshotBefore.handNumber)
    : null;
  const aiState = createPokerAIState(stateBefore, aiPlayer.id, {
    difficulty: aiPlayer.aiDifficulty ?? "medium",
    actionHistory: history?.actions ?? [],
  });
  const decision = await decidePokerAction(client, aiState);
  const stateAfter = pokerEngineAdapter.applyAction(
    stateBefore,
    aiPlayer.id,
    decision.action,
  );
  const snapshotAfter = pokerEngineAdapter.snapshot(stateAfter);
  const persistedGame = await repository.persistAIAction({
    gameId,
    expectedVersion: game.version,
    playerEngineId: aiPlayer.id,
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
    probabilities: decision.probabilities,
    confidence: decision.confidence,
    raiseSizeChoice: decision.sizing?.choice ?? null,
    raiseSizeProbabilities: decision.sizing?.probabilities ?? null,
    rawResponse: decision.rawResponse,
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
      poker: publicProjectionForViewer(projectedState, viewerToken),
    },
    aiDecision: {
      action: decision.action.type,
      amount:
        "amount" in decision.action ? (decision.action.amount ?? null) : null,
      probabilities: decision.probabilities,
      confidence: decision.confidence,
      sizing: decision.sizing ?? null,
    },
  };
}

export async function startNextHand(
  repository: GameReader &
    NextHandWriter &
    Partial<SeatAssignmentRepository & GameHostReader>,
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
    poker: publicProjectionForViewer(projectedState, viewerToken),
  };
}
