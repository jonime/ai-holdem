import { pokerEngineAdapter } from "./adapter";
import { createPokerAIState } from "./ai-state";
import { applyHumanAction, type HumanActionSubmission } from "./human-actions";
import type { GameConfig, PokerGameState, PublicPokerGame } from "./types";
import type {
  CreateGameSessionInput,
  PersistAIActionInput,
  PersistHumanActionInput,
  PersistedGame,
  StartNextHandInput,
} from "@/lib/supabase/queries";
import { GameConflictError } from "@/lib/supabase/queries";
import {
  decidePokerAction,
  type TypesafeDecisionClient,
} from "@/lib/typesafe/decision";

export interface CreateDemoGameOptions {
  readonly seatCount?: number;
  readonly hostToken?: string;
}

export function createDemoGameConfig(
  options: CreateDemoGameOptions = {},
): GameConfig {
  const seatCount = Math.max(2, options.seatCount ?? 2);

  return {
    smallBlind: 50,
    bigBlind: 100,
    seatCount,
    players: [
      {
        id: "human",
        seat: 0,
        name: "You",
        controller: "human",
        stack: 10_000,
        status: "claimed",
        playerToken: options.hostToken ?? null,
        isHost: true,
      },
      {
        id: "typesafe-ai",
        seat: 1,
        name: "TypeSafe AI",
        controller: "typesafe_ai",
        stack: 10_000,
        status: "bot",
        playerToken: null,
        isHost: false,
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
  readonly status: SeatStatus;
  readonly controller: "human" | "typesafe_ai";
  readonly playerToken: string | null;
  readonly isHost: boolean;
}

export interface SeatAssignmentRepository {
  getSeatAssignments(gameId: string): Promise<readonly SeatAssignment[]>;
  updateSeatAssignment(input: {
    readonly gameId: string;
    readonly seat: number;
    readonly status: SeatStatus;
    readonly controller?: "human" | "typesafe_ai";
    readonly playerToken?: string | null;
    readonly isHost?: boolean;
  }): Promise<void>;
}

export interface HumanActionWriter {
  persistHumanAction(input: PersistHumanActionInput): Promise<PersistedGame>;
}

export interface AIActionWriter {
  persistAIAction(input: PersistAIActionInput): Promise<PersistedGame>;
}

export interface NextHandWriter {
  startNextHand(input: StartNextHandInput): Promise<PersistedGame>;
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
    readonly choice: "small" | "medium" | "large" | "all_in";
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
  const initialState = pokerEngineAdapter.startHand(
    pokerEngineAdapter.createGame(config),
  );
  const persistedGame = await repository.createGameSession({
    currentState: initialState,
    stateSchemaVersion: initialState.stateSchemaVersion,
    handNumber: 1,
    status: "playing",
    players: initialState.config.players.map((player) => ({
      enginePlayerId: player.id,
      seat: player.seat,
      name: player.name,
      controller: player.controller,
      stack: player.stack,
      status: player.status,
      playerToken: player.playerToken ?? null,
      isHost: player.isHost,
    })),
  });

  return {
    gameId: persistedGame.id,
    state: initialState,
    version: persistedGame.version,
  };
}

export async function claimSeat(
  repository: SeatAssignmentRepository,
  gameId: string,
  seat: number,
  playerToken: string,
): Promise<SeatAssignment> {
  const seatAssignments = await repository.getSeatAssignments(gameId);
  const assignment = seatAssignments.find((entry) => entry.seat === seat);

  if (!assignment) {
    throw new Error("Seat does not exist");
  }
  if (assignment.status !== "open") {
    throw new Error("Seat is not open");
  }

  const updatedAssignment: SeatAssignment = {
    ...assignment,
    status: "claimed",
    controller: "human",
    playerToken,
    isHost: false,
  };

  await repository.updateSeatAssignment({
    gameId,
    seat,
    status: "claimed",
    controller: "human",
    playerToken,
    isHost: false,
  });

  return updatedAssignment;
}

export async function assignBotToSeat(
  repository: SeatAssignmentRepository,
  gameId: string,
  seat: number,
  hostToken: string,
): Promise<SeatAssignment> {
  const seatAssignments = await repository.getSeatAssignments(gameId);
  const hostAssignment = seatAssignments.find(
    (entry) => entry.isHost && entry.playerToken === hostToken,
  );
  const assignment = seatAssignments.find((entry) => entry.seat === seat);

  if (!hostAssignment) {
    throw new Error("Only the host can assign bots");
  }
  if (!assignment) {
    throw new Error("Seat does not exist");
  }
  if (assignment.status !== "open") {
    throw new Error("Seat is not open");
  }

  const updatedAssignment: SeatAssignment = {
    ...assignment,
    status: "bot",
    controller: "typesafe_ai",
    playerToken: null,
    isHost: false,
  };

  await repository.updateSeatAssignment({
    gameId,
    seat,
    status: "bot",
    controller: "typesafe_ai",
    playerToken: null,
    isHost: false,
  });

  return updatedAssignment;
}

export async function releaseSeat(
  repository: SeatAssignmentRepository,
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

  const updatedAssignment: SeatAssignment = {
    ...assignment,
    status: "open",
    controller: "human",
    playerToken: null,
    isHost: false,
  };

  await repository.updateSeatAssignment({
    gameId,
    seat,
    status: "open",
    controller: "human",
    playerToken: null,
    isHost: false,
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

  const state = pokerEngineAdapter.restore(game.currentState as PokerGameState);
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
  repository: GameReader & HumanActionWriter,
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

  const stateAfter = applyHumanAction(stateBefore, {
    ...submission,
    currentVersion: game.version,
  });
  const snapshotAfter = pokerEngineAdapter.snapshot(stateAfter);
  const persistedGame = await repository.persistHumanAction({
    gameId,
    expectedVersion: submission.expectedVersion,
    playerEngineId: submission.playerId,
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

  return {
    id: persistedGame.id,
    status: persistedGame.status,
    version: persistedGame.version,
    poker: pokerEngineAdapter.publicProjection(stateAfter, "human"),
  };
}

export async function stepTypesafeAction(
  repository: GameReader & AIActionWriter,
  client: TypesafeDecisionClient,
  gameId: string,
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

  const aiState = createPokerAIState(stateBefore, aiPlayer.id);
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

  return {
    game: {
      id: persistedGame.id,
      status: persistedGame.status,
      version: persistedGame.version,
      poker: pokerEngineAdapter.publicProjection(stateAfter, "human"),
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
  repository: GameReader & NextHandWriter,
  gameId: string,
  expectedVersion: number,
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

  const occupiedSeats = new Set(
    completedState.config.players.map((player) => player.seat),
  );
  const seatCount =
    completedState.config.seatCount ??
    Math.max(
      0,
      ...completedState.config.players.map((player) => player.seat + 1),
    );
  const hasOpenSeat = Array.from({ length: seatCount }, (_, seat) => seat).some(
    (seat) => !occupiedSeats.has(seat),
  );
  if (hasOpenSeat) {
    throw new Error("Waiting for players");
  }

  const nextState = pokerEngineAdapter.startHand(completedState);
  const nextSnapshot = pokerEngineAdapter.snapshot(nextState);
  const persistedGame = await repository.startNextHand({
    gameId,
    expectedVersion,
    currentState: nextState,
    stateSchemaVersion: nextState.stateSchemaVersion,
    handNumber: nextSnapshot.handNumber,
  });

  return {
    id: persistedGame.id,
    status: persistedGame.status,
    version: persistedGame.version,
    poker: pokerEngineAdapter.publicProjection(nextState, "human"),
  };
}
