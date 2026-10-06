import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const { mine, create } = vi.hoisted(() => ({ mine: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: create }));
const game = { gameId: "11111111-1111-4111-8111-111111111111", title: null, status: "complete", updatedAt: "2026-10-06T12:00:00Z", occupiedSeats: 2, totalSeats: 6 };
beforeEach(() => { vi.clearAllMocks(); create.mockReturnValue({ listMyGames: mine }); mine.mockResolvedValue([game]); });
const request = (cookie?: string) => new Request("http://localhost/api/games/mine?playerToken=other", { headers: cookie ? { cookie } : {} });
it("returns empty without identity, creating neither a repository nor cookie", async () => {
  const response = await GET(request());
  expect(await response.json()).toEqual({ games: [] });
  expect(create).not.toHaveBeenCalled();
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("uses only the cookie and returns summary fields uncached", async () => {
  const response = await GET(request("ai-holdem-player-id=owner"));
  expect(mine).toHaveBeenCalledWith("owner");
  expect(await response.json()).toEqual({ games: [game] });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it.each([null, {}, [{ ...game, occupiedSeats: 7 }], [{ ...game, cards: ["As"] }], [{ ...game, status: "unknown" }]])("rejects malformed or private summaries %j", async games => {
  mine.mockResolvedValue(games);
  const response = await GET(request("ai-holdem-player-id=owner"));
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ error: "Unable to load your tables" });
});
it("does not log repository failures or leak them into errors", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mine.mockRejectedValue(new Error("private token"));
  const response = await GET(request("ai-holdem-player-id=owner"));
  expect(response.status).toBe(500); expect(await response.text()).not.toContain("private token"); expect(log).not.toHaveBeenCalled(); log.mockRestore();
});
it("handles malformed cookie errors with no-store", async () => {
  const response = await GET(request("ai-holdem-player-id=%xx"));
  expect(response.status).toBe(500); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
