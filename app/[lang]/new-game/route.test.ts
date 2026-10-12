vi.mock("@/lib/usage/creation", () => ({ admitGameCreation: vi.fn(async () => {}) }));
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

  it("redirects English creation to an unprefixed table", async () => {
    const response = await POST(
      new Request("https://example.test/new-game", { method: "POST" }),
      { params: Promise.resolve({ lang: "en-US" }) },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.test/game/game-123");
  });

  it.each(["Ada", "  Ada  ", "", "   ", "A".repeat(40)])("passes string form name %j to the existing server sanitizer", async hostName => {
    const body = new URLSearchParams({ hostName });
    const response = await POST(new Request("https://example.test/fi-FI/new-game", {
      method: "POST", body, headers: { cookie: "ai-holdem-player-id=host-token" },
    }), { params: Promise.resolve({ lang: "fi-FI" }) });
    expect(response.status).toBe(303);
    expect(createDemoGame).toHaveBeenCalledWith(repository, { hostToken: "host-token", hostName });
  });

  it.each(["missing", "file", "malformed", "json", "query"])("keeps %s names anonymous", async kind => {
    const form = new FormData();
    if (kind === "file") form.set("hostName", new Blob(["Ada"]), "name.txt");
    const response = await POST(new Request(`https://example.test/new-game${kind === "query" ? "?hostName=Ada" : ""}`, {
      method: "POST",
      body: kind === "malformed" ? "invalid" : kind === "json" ? JSON.stringify({ hostName: "Ada" }) : form,
      headers: { cookie: "ai-holdem-player-id=host-token", ...(kind === "malformed" ? { "content-type": "multipart/form-data" } : kind === "json" ? { "content-type": "application/json" } : {}) },
    }), { params: Promise.resolve({ lang: "en-US" }) });
    expect(response.status).toBe(303);
    expect(createDemoGame).toHaveBeenCalledWith(repository, { hostToken: "host-token" });
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
      new Request("https://example.test/new-game", { method: "POST" }),
      { params: Promise.resolve({ lang: "en-US" }) },
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Unable to create game");
    expect(consoleError).toHaveBeenCalledExactlyOnceWith({ event: "application_request_failed", operation: "create_game_html", category: "unexpected", status: 500, requestReference: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    consoleError.mockRestore();
  });
});
