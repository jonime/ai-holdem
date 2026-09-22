import { pokerEngineAdapter } from "./adapter";
import { createPokerAIState } from "./ai-state";
import { applyHumanAction, type HumanActionSubmission } from "./human-actions";
import type {
  AIDifficulty,
  GameConfig,
  PokerGameState,
  PublicPokerGame,
  PokerPlayerConfig,
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

  return {
    smallBlind: 50,
    bigBlind: 100,
    seatCount,
    players: [
      {
        id: "human",
        seat: 0,
        name: sanitizePlayerName(options.hostName, "You"),
        controller: "human",
        stack: 10_000,
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

export interface CreatedGame {
  readonly gameId: string;
  readonly state: PokerGameState;
  readonly version: number;
}

export interface PublicGame {
  readonly id: string;
  readonly status: PersistedGame["status"];
  readonly version: number;
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

export async function createDemoGame(
  repository: GameSessionWriter,
  options: CreateDemoGameOptions = {},
): Promise<CreatedGame> {
  const config = createDemoGameConfig(options);
  const initialState = pokerEngineAdapter.createGame(config);
  const persistedGame = await repository.createGameSession({
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
        stack: player?.stack ?? 10_000,
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
    stack: 10_000,
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
  for (const assignment of assignments) {
    if (configuredSeats.has(assignment.seat)) continue;
    players.push(playerConfigForAssignment(gameId, assignment));
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

async function reconcileState(
  repository: SeatAssignmentRepository,
  gameId: string,
  state: PokerGameState,
): Promise<PokerGameState> {
  const assignments = await repository.getSeatAssignments(gameId);
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
        playerConfigForAssignment(gameId, assignment),
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
  repository: GameReader & SeatAssignmentRepository & StartGameWriter,
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
  const hasHost = assignments.some((assignment) => assignment.isHost);
  if (
    hasHost &&
    !assignments.some(
      (assignment) =>
        assignment.isHost && assignment.playerToken === callerToken,
    )
  ) {
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
    pokerEngineAdapter.restore(game.currentState as PokerGameState),
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
  if (!Number.isInteger(seatCount) || seatCount < 2 || seatCount > 6) {
    throw new Error("seatCount must be an integer from 2 through 6");
  }

  const game = await repository.getGame(gameId);
  if (!game) throw new GameNotFoundError(gameId);
  if (game.status !== "waiting") throw new Error("The game is not waiting");
  if (game.version !== expectedVersion) {
    throw new GameConflictError(gameId, expectedVersion);
  }

  const assignments = await repository.getSeatAssignments(gameId);
  const hasHost = assignments.some((assignment) => assignment.isHost);
  if (
    hasHost &&
    !assignments.some(
      (assignment) =>
        assignment.isHost && assignment.playerToken === callerToken,
    )
  ) {
    throw new Error("Only the host can change the seat count");
  }

  const highestOccupiedSeat = assignments.reduce(
    (highest, assignment) =>
      assignment.status !== "open"
        ? Math.max(highest, assignment.seat)
        : highest,
    -1,
  );
  if (highestOccupiedSeat >= seatCount) {
    throw new Error("Cannot shrink seat count below an occupied seat");
  }

  const state = pokerEngineAdapter.restore(game.currentState as PokerGameState);
  const nextState = pokerEngineAdapter.createGame({
    ...state.config,
    seatCount,
  });

  const persistedGame = await repository.updateSeatCount({
    gameId,
    expectedVersion,
    seatCount,
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
  repository: SeatAssignmentRepository,
  gameId: string,
  seat: number,
  hostToken: string,
  difficulty: AIDifficulty = "medium",
): Promise<SeatAssignment> {
  const seatAssignments = await repository.getSeatAssignments(gameId);
  const hasHost = seatAssignments.some((entry) => entry.isHost);
  const hostAssignment = seatAssignments.find(
    (entry) => entry.isHost && entry.playerToken === hostToken,
  );
  const assignment = seatAssignments.find((entry) => entry.seat === seat);

  if (hasHost && !hostAssignment) {
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
  repository: SeatAssignmentRepository & Partial<GameReader>,
  gameId: string,
  seat: number,
  playerToken: string,
): Promise<SeatAssignment> {
  const seatAssignments = await repository.getSeatAssignments(gameId);
  const assignment = seatAssignments.find((entry) => entry.seat === seat);

  if (!assignment) {
    throw new Error("Seat does not exist");
  }

  const isHostRelease = seatAssignments.some(
    (entry) => entry.isHost && entry.playerToken === playerToken,
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
        game.currentState as PokerGameState,
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
  repository: GameReader,
  gameId: string,
  viewerPlayerToken?: string | null,
): Promise<PublicGame> {
  const game = await repository.getGame(gameId);
  if (!game) {
    throw new GameNotFoundError(gameId);
  }

  let state = pokerEngineAdapter.restore(game.currentState as PokerGameState);
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
    poker: pokerEngineAdapter.publicProjection(state, viewerPlayerId),
  };
}

export async function submitHumanAction(
  repository: GameReader &
    HumanActionWriter &
    Partial<SeatAssignmentRepository>,
  gameId: string,
  submission: Omit<HumanActionSubmission, "currentVersion">,
): Promise<PublicGame> {
  const game = await repository.getGame(gameId);
  if (!game) {
    throw new GameNotFoundError(gameId);
  }

  const stateBefore = pokerEngineAdapter.restore(
    game.currentState as PokerGameState,
  );
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
    poker: pokerEngineAdapter.publicProjection(
      projectedState,
      resolvedPlayerId,
    ),
  };
}

export async function stepTypesafeAction(
  repository: GameReader &
    AIActionWriter &
    Partial<SeatAssignmentRepository & HandHistoryReader>,
  client: TypesafeDecisionClient,
  gameId: string,
  viewerToken: string | null = null,
): Promise<TypesafeStepResult> {
  const game = await repository.getGame(gameId);
  if (!game) {
    throw new GameNotFoundError(gameId);
  }

  const stateBefore = pokerEngineAdapter.restore(
    game.currentState as PokerGameState,
  );
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
  repository: GameReader & NextHandWriter & Partial<SeatAssignmentRepository>,
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

  const completedState = pokerEngineAdapter.restore(
    game.currentState as PokerGameState,
  );
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
    poker: publicProjectionForViewer(projectedState, viewerToken),
  };
}
