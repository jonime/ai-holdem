import type { DepartureFold } from "./departure-contracts";
import type { TableSettings } from "./types";
import type {
  CreateGameSessionInput,
  GameFeed,
  PersistHumanActionInput,
  PersistedGame,
  GameListing,
  GameReadSnapshot,
  StartNextHandInput,
  UpdateSeatCountInput,
} from "@/lib/supabase/queries";

export interface GameSessionWriter {
  createGameSession(input: CreateGameSessionInput): Promise<PersistedGame>;
}

export interface GameReader {
  getGame(gameId: string): Promise<PersistedGame | null>;
}

export interface GameSnapshotReader {
  getGameReadSnapshot(gameId: string): Promise<GameReadSnapshot | null>;
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

export interface GameListingReader {
  getGameListing(gameId: string): Promise<GameListing | null>;
}

export interface HumanActionWriter {
  persistHumanAction(input: PersistHumanActionInput): Promise<PersistedGame>;
}

export interface GameFeedReader {
  getGameFeed(
    gameId: string,
    handLimit?: number,
    sinceHand?: number,
  ): Promise<GameFeed>;
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

export interface DepartureWriter {
  advanceDepartureIfVersion(input: DepartureFold & { readonly driverToken: string }): Promise<PersistedGame>;
}
