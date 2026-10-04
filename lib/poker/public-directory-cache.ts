import { directoryCursorSchema } from "@/lib/http/discovery-contracts";
import "server-only";

import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import type { PublicGameDirectoryEntry } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { excludeViewerGames, listPublicGames } from "./directory";

const PUBLIC_DIRECTORY_CACHE_TAG = "public-game-directory";
const DIRECTORY_PAGE_SIZE = 50;

export interface PublicDirectoryCursor {
  readonly publishedAt: string;
  readonly gameId: string;
}

export interface PublicDirectoryPage {
  readonly games: readonly PublicGameDirectoryEntry[];
  readonly nextCursor: string | null;
}

export function encodePublicDirectoryCursor(cursor: PublicDirectoryCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodePublicDirectoryCursor(value: string | null): PublicDirectoryCursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const cursor = directoryCursorSchema.safeParse(parsed);
    if (cursor.success) return cursor.data;

  } catch {}
  return null;
}

async function getPublicGameCandidates(
  cursorPublishedAt: string | null,
  cursorGameId: string | null,
): Promise<PublicDirectoryPage> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 3, expire: 5 });
  cacheTag(PUBLIC_DIRECTORY_CACHE_TAG);

  const cursor = cursorPublishedAt && cursorGameId
    ? { publishedAt: cursorPublishedAt, gameId: cursorGameId }
    : null;
  const games = await listPublicGames(createSupabaseGameRepository(), null, cursor);
  const last = games.at(-1);
  return {
    games,
    nextCursor: games.length === DIRECTORY_PAGE_SIZE && last
      ? encodePublicDirectoryCursor({ publishedAt: last.publishedAt, gameId: last.gameId })
      : null,
  };
}

export async function getPublicDirectoryPage(
  playerToken: string | null,
  cursor: PublicDirectoryCursor | null = null,
): Promise<PublicDirectoryPage> {
  const page = await getPublicGameCandidates(
    cursor?.publishedAt ?? null,
    cursor?.gameId ?? null,
  );
  if (!playerToken) return page;

  const excludedGameIds = await createSupabaseGameRepository()
    .listPublicGameExclusions(playerToken);
  return {
    ...page,
    games: excludeViewerGames(page.games, excludedGameIds),
  };
}

export function invalidatePublicDirectory(): void {
  revalidateTag(PUBLIC_DIRECTORY_CACHE_TAG, { expire: 0 });
}
