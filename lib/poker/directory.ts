import type {
  DirectoryJoinResult,
  PersistedGame,
  PublicGameDirectoryEntry,
} from "@/lib/supabase/queries";
import { sanitizePlayerName } from "./game-service";

export interface PublicDirectoryRepository {
  listPublicGames(input: {
    readonly playerToken: string | null;
    readonly cursorPublishedAt?: string | null;
    readonly cursorGameId?: string | null;
    readonly limit?: number;
  }): Promise<readonly PublicGameDirectoryEntry[]>;
  listPublicGameExclusions(playerToken: string): Promise<readonly string[]>;
  joinPublicGame(input: {
    readonly gameId: string;
    readonly expectedVersion: number;
    readonly playerToken: string;
    readonly name: string | null;
  }): Promise<DirectoryJoinResult>;
  setGamePublication(input: {
    readonly gameId: string;
    readonly expectedVersion: number;
    readonly hostToken: string;
    readonly isPublic: boolean;
    readonly title: string | null;
  }): Promise<PersistedGame>;
  renewGameListingLease(gameId: string, hostToken: string): Promise<boolean>;
}

export function normalizeListingTitle(raw: string | null | undefined): string | null {
  const title = (raw ?? "").trim();
  return title ? title.slice(0, 60) : null;
}

export function normalizeDirectoryPlayerName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed ? sanitizePlayerName(trimmed, "Player") : null;
}

export async function listPublicGames(
  repository: PublicDirectoryRepository,
  playerToken: string | null,
  cursor?: { readonly publishedAt: string; readonly gameId: string } | null,
) {
  return repository.listPublicGames({
    playerToken,
    cursorPublishedAt: cursor?.publishedAt,
    cursorGameId: cursor?.gameId,
    limit: 50,
  });
}

export function excludeViewerGames(
  games: readonly PublicGameDirectoryEntry[],
  excludedGameIds: readonly string[],
): readonly PublicGameDirectoryEntry[] {
  if (excludedGameIds.length === 0) return games;
  const excluded = new Set(excludedGameIds);
  return games.filter((game) => !excluded.has(game.gameId));
}

export async function joinPublicGame(
  repository: PublicDirectoryRepository,
  input: {
    readonly gameId: string;
    readonly expectedVersion: number;
    readonly playerToken: string;
    readonly name?: string | null;
  },
) {
  return repository.joinPublicGame({
    ...input,
    name: normalizeDirectoryPlayerName(input.name),
  });
}

export async function setGamePublication(
  repository: PublicDirectoryRepository,
  input: {
    readonly gameId: string;
    readonly expectedVersion: number;
    readonly hostToken: string;
    readonly isPublic: boolean;
    readonly title?: string | null;
  },
) {
  return repository.setGamePublication({
    ...input,
    title: normalizeListingTitle(input.title),
  });
}
