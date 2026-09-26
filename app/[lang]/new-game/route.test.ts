import { beforeEach, describe, expect, it, vi } from "vitest";

const createDemoGame = vi.hoisted(() => vi.fn());
const repository = vi.hoisted(() => ({}));

vi.mock("@/lib/poker/game-service", () => ({ createDemoGame }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseGameRepository: () => repository,
}));

import { POST } from "./route";

describe("localized anonymous game creation", () => {
  beforeEach(() => {
    createDemoGame.mockReset();
    createDemoGame.mockResolvedValue({ gameId: "game-123" });
  });

  it("creates an anonymous game and redirects to its localized lobby", async () => {
    const response = await POST(
      new Request("https://example.test/fi-FI/new-game", {
        method: "POST",
        headers: { cookie: "ai-holdem-player-id=host-token" },
      }),
      { params: Promise.resolve({ lang: "fi-FI" }) },
    );

    expect(createDemoGame).toHaveBeenCalledWith(repository, {
      hostToken: "host-token",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://example.test/fi-FI/game/game-123",
    );
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("ai-holdem-player-id=host-token");
    expect(cookies).toContain("last-visited-game-id=game-123");
  });

  it("rejects an unsupported locale without creating a game", async () => {
    const response = await POST(
      new Request("https://example.test/xx-XX/new-game", { method: "POST" }),
      { params: Promise.resolve({ lang: "xx-XX" }) },
    );

    expect(response.status).toBe(404);
    expect(createDemoGame).not.toHaveBeenCalled();
  });

  it("returns a server error when creation fails", async () => {
    createDemoGame.mockRejectedValue(new Error("database unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(
      new Request("https://example.test/en-US/new-game", { method: "POST" }),
      { params: Promise.resolve({ lang: "en-US" }) },
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Unable to create game");
    consoleError.mockRestore();
  });
});
