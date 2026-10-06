vi.mock("@/lib/usage/creation", () => ({ admitGameCreation: vi.fn(async () => {}) }));
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


describe("JSON Quick Play", () => {
  it("returns only the game ID and both cookies, using the existing identity", async () => {
    createQuickPlayGame.mockResolvedValueOnce({ gameId: "fresh-game", holeCards: ["Ac"], token: "secret" });
    const response = await POST(new Request("https://example.test/en-US/quick-game", {
      method: "POST", headers: { Accept: "application/json", cookie: "ai-holdem-player-id=owner" },
    }), { params: Promise.resolve({ lang: "en-US" }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ gameId: "fresh-game" });
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toContain("ai-holdem-player-id=owner");
    expect(response.headers.get("set-cookie")).toContain("last-visited-game-id=fresh-game");
  });
  it("rejects invalid locales as JSON without creating a game", async () => {
    createQuickPlayGame.mockClear();
    const response = await POST(new Request("https://example.test/invalid/quick-game", {
      method: "POST", headers: { Accept: "application/json" },
    }), { params: Promise.resolve({ lang: "invalid" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(createQuickPlayGame).not.toHaveBeenCalled();
  });
  it("sanitizes JSON failures and does not set cookies", async () => {
    createQuickPlayGame.mockRejectedValueOnce(new Error("provider-secret database-detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(new Request("https://example.test/en-US/quick-game", {
      method: "POST", headers: { Accept: "application/json" },
    }), { params: Promise.resolve({ lang: "en-US" }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to create quick game" });
    expect(response.headers.get("set-cookie")).toBeNull();
    log.mockRestore();
  });
});
