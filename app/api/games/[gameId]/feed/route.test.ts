import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
const { getFeed, repository } = vi.hoisted(() => ({ getFeed: vi.fn(), repository: {} }));
vi.mock("@/lib/poker/game-service", () => ({ getGameFeed: getFeed }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: () => repository }));
const request = (query: string) => GET(new Request(`http://localhost/api/games/game-1/feed${query}`), {
  params: Promise.resolve({ gameId: "game-1" }),
});

describe("GET game feed", () => {
  beforeEach(() => { vi.clearAllMocks(); getFeed.mockResolvedValue({ events: [] }); });
  it.each([["", undefined], ["?sinceHand=0", 0], ["?sinceHand=12", 12], ["?sinceHand=2147483647", 2147483647]])("forwards %s and retains the envelope", async (query, sinceHand) => {
    const response = await request(query as string);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ feed: { events: [] } });
    expect(getFeed).toHaveBeenCalledWith(repository, "game-1", sinceHand);
  });
  it.each(["", "-1", "1.5", "1e2", "NaN", "2147483648", "999999999999999999999", "%20", "%2B1", "1&sinceHand=2"])("rejects invalid cursor %s before loading data", async value => {
    expect((await request(`?sinceHand=${value}`)).status).toBe(400);
    expect(getFeed).not.toHaveBeenCalled();
  });
  it("maps repository failures to the existing generic error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      getFeed.mockRejectedValue(new Error("secret database detail"));
      const response = await request("?sinceHand=1");
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Unable to load game feed" });
    } finally { log.mockRestore(); }
  });
});
