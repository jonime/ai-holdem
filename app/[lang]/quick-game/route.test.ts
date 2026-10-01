import { beforeEach, describe, expect, it, vi } from "vitest";

const createQuickPlayGame = vi.hoisted(() => vi.fn());
const repository = vi.hoisted(() => ({}));

vi.mock("@/lib/poker/game-service", () => ({ createQuickPlayGame }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseGameRepository: () => repository,
}));

import { POST } from "./route";

describe("localized quick-play creation", () => {
  beforeEach(() => {
    createQuickPlayGame.mockReset();
    createQuickPlayGame.mockResolvedValue({ gameId: "quick-game-123" });
  });

  it("creates a started anonymous game and redirects to its localized table", async () => {
    const response = await POST(
      new Request("https://example.test/fi-FI/quick-game", {
        method: "POST",
        headers: { cookie: "ai-holdem-player-id=host-token" },
      }),
      { params: Promise.resolve({ lang: "fi-FI" }) },
    );

    expect(createQuickPlayGame).toHaveBeenCalledWith(repository, {
      hostToken: "host-token",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://example.test/fi-FI/game/quick-game-123",
    );
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("ai-holdem-player-id=host-token");
    expect(cookies).toContain("last-visited-game-id=quick-game-123");
  });

  it("creates and returns a new anonymous host token", async () => {
    const response = await POST(
      new Request("https://example.test/en-US/quick-game", { method: "POST" }),
      { params: Promise.resolve({ lang: "en-US" }) },
    );

    const [{ hostToken }] = createQuickPlayGame.mock.calls[0].slice(1);
    expect(hostToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("set-cookie")).toContain(
      `ai-holdem-player-id=${hostToken}`,
    );
  });

  it("rejects an unsupported locale without creating a game", async () => {
    const response = await POST(
      new Request("https://example.test/xx-XX/quick-game", { method: "POST" }),
      { params: Promise.resolve({ lang: "xx-XX" }) },
    );

    expect(response.status).toBe(404);
    expect(createQuickPlayGame).not.toHaveBeenCalled();
  });

  it("returns a server error when creation fails", async () => {
    createQuickPlayGame.mockRejectedValue(new Error("database unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(
      new Request("https://example.test/en-US/quick-game", { method: "POST" }),
      { params: Promise.resolve({ lang: "en-US" }) },
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Unable to create quick game");
    consoleError.mockRestore();
  });
});
