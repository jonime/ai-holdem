import { describe, expect, it, vi } from "vitest";
import { excludeViewerGames, joinPublicGame, listPublicGames, normalizeDirectoryPlayerName, normalizeListingTitle, setGamePublication } from "./directory";

function repository() {
  return {
    listPublicGames: vi.fn().mockResolvedValue([]),
    listPublicGameExclusions: vi.fn().mockResolvedValue([]),
    joinPublicGame: vi.fn().mockResolvedValue({ outcome: "joined", seat: 1, version: 2, duplicate: false }),
    setGamePublication: vi.fn().mockResolvedValue({ id: "game-1", status: "waiting", currentState: {}, stateSchemaVersion: 1, handNumber: 0, version: 2 }),
    renewGameListingLease: vi.fn().mockResolvedValue(true),
  };
}

describe("public game directory", () => {
  it("normalizes titles and player names at their public limits", () => {
    expect(normalizeListingTitle("   ")).toBeNull();
    expect(normalizeListingTitle("x".repeat(70))).toHaveLength(60);
    expect(normalizeDirectoryPlayerName("   ")).toBeNull();
    expect(normalizeDirectoryPlayerName("x".repeat(40))).toHaveLength(30);
  });

  it("passes viewer identity and a stable cursor to discovery", async () => {
    const repo = repository();
    await listPublicGames(repo, "viewer", { publishedAt: "2026-09-29T00:00:00Z", gameId: "game-1" });
    expect(repo.listPublicGames).toHaveBeenCalledWith({ playerToken: "viewer", cursorPublishedAt: "2026-09-29T00:00:00Z", cursorGameId: "game-1", limit: 50 });
  });

  it("removes host and seated games from a shared candidate page", () => {
    const games = [
      { gameId: "game-1" },
      { gameId: "game-2" },
      { gameId: "game-3" },
    ] as unknown as Parameters<typeof excludeViewerGames>[0];

    expect(excludeViewerGames(games, ["game-1", "game-3"]).map((game) => game.gameId)).toEqual(["game-2"]);
  });

  it("sanitizes join names while preserving the database seat fallback", async () => {
    const repo = repository();
    await joinPublicGame(repo, { gameId: "game-1", expectedVersion: 1, playerToken: "viewer", name: "  Alice  " });
    expect(repo.joinPublicGame).toHaveBeenCalledWith(expect.objectContaining({ name: "Alice" }));
    await joinPublicGame(repo, { gameId: "game-1", expectedVersion: 1, playerToken: "viewer", name: " " });
    expect(repo.joinPublicGame).toHaveBeenLastCalledWith(expect.objectContaining({ name: null }));
  });

  it("normalizes publication titles before the versioned mutation", async () => {
    const repo = repository();
    await setGamePublication(repo, { gameId: "game-1", expectedVersion: 1, hostToken: "host", isPublic: true, title: "  Friday table  " });
    expect(repo.setGamePublication).toHaveBeenCalledWith(expect.objectContaining({ title: "Friday table" }));
  });
});
