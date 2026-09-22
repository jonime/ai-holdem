import { pokerEngineAdapter } from "./adapter";
import { applyHumanAction, type HumanActionSubmission } from "./human-actions";
import type { GameConfig, PokerGameState, PublicPokerGame } from "./types";
import type {
  CreateGameSessionInput,
  PersistHumanActionInput,
  PersistedGame,
} from "@/lib/supabase/queries";

export const demoGameConfig: GameConfig = {
  smallBlind: 50,
  bigBlind: 100,
  players: [
    {
      id: "human",
      seat: 0,
      name: "You",
      controller: "human",
      stack: 10_000,
    },
    {
      id: "typesafe-ai",
      seat: 1,
      name: "TypeSafe AI",
      controller: "typesafe_ai",
      stack: 10_000,
    },
  ],
};

export interface GameSessionWriter {
  createGameSession(input: CreateGameSessionInput): Promise<PersistedGame>;
}

export interface GameReader {
  getGame(gameId: string): Promise<PersistedGame | null>;
}

export interface HumanActionWriter {
  persistHumanAction(input: PersistHumanActionInput): Promise<PersistedGame>;
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

export class GameNotFoundError extends Error {
  constructor(gameId: string) {
    super(`Game not found: ${gameId}`);
    this.name = "GameNotFoundError";
  }
}

export async function createDemoGame(
  repository: GameSessionWriter,
): Promise<CreatedGame> {
  const initialState = pokerEngineAdapter.startHand(
    pokerEngineAdapter.createGame(demoGameConfig),
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
    })),
  });

  return {
    gameId: persistedGame.id,
    state: initialState,
    version: persistedGame.version,
  };
}

export async function getPublicGame(
  repository: GameReader,
  gameId: string,
): Promise<PublicGame> {
  const game = await repository.getGame(gameId);
  if (!game) {
    throw new GameNotFoundError(gameId);
  }

  const state = pokerEngineAdapter.restore(game.currentState as PokerGameState);

  return {
    id: game.id,
    status: game.status,
    version: game.version,
    poker: pokerEngineAdapter.publicProjection(state, "human"),
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
