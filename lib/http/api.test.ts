import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { api, HttpError } from "./api";
import { GAME_VERSION_CONFLICT, type GetGameResponse, type StepBotResponse, type SubmitActionResponse } from "./gameplay-contracts";
import { gameplayGame as game, gameplayDecision as aiDecision } from "@/test/fixtures/gameplay";

afterEach(() => vi.unstubAllGlobals());
function mockResponse(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("gameplay client", () => {
  it("encodes game IDs, forwards abort and cookies, and disables read caching", async () => {
    const fetch = mockResponse({ game });
    const controller = new AbortController();
    const body = await api.games.get({ gameId: "a/b ?" }, { signal: controller.signal });
    expect(fetch).toHaveBeenCalledWith("/api/games/a%2Fb%20%3F", {
      cache: "no-store", credentials: "same-origin", signal: controller.signal,
    });
    expect(body.game.id).toBe(game.id);
    expect(body.game.publication).toBeNull();
    expectTypeOf(body).toExtend<GetGameResponse>();
  });
  it("serializes only the action request body and infers its result", async () => {
    const fetch = mockResponse({ game });
    const body = await api.games.submitAction({ gameId: "game-1", expectedVersion: 2, action: { type: "raise", amount: 100 } });
    expect(fetch).toHaveBeenCalledWith("/api/games/game-1/action", expect.objectContaining({
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ expectedVersion: 2, action: { type: "raise", amount: 100 } }),
    }));
    expectTypeOf(body).toExtend<SubmitActionResponse>();
  });
  it("serializes bot versions, forwards abort, and validates AI decisions", async () => {
    const fetch = mockResponse({ game, aiDecision });
    const signal = new AbortController().signal;
    const body = await api.games.stepBot({ gameId: "game-1", expectedVersion: 2 }, { signal });
    expect(fetch).toHaveBeenCalledWith("/api/games/game-1/step", expect.objectContaining({
      method: "POST", body: '{"expectedVersion":2}', signal,
    }));
    expectTypeOf(body).toExtend<StepBotResponse>();
    mockResponse({ game, aiDecision: {} });
    await expect(api.games.stepBot({ gameId: "game-1", expectedVersion: 2 })).rejects.toThrow("Invalid response payload");
  });
  it("rejects malformed JSON and invalid successful games", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("broken")));
    await expect(api.games.get({ gameId: "game" })).rejects.toThrow("Invalid response payload");
    mockResponse({ game: { ...game, version: "2" } });
    await expect(api.games.get({ gameId: "game" })).rejects.toThrow("Invalid response payload");
  });
  it("retains HTTP status, message, and optional code", async () => {
    mockResponse({ error: "Game version conflict", code: GAME_VERSION_CONFLICT }, 409);
    await expect(api.games.stepBot({ gameId: "game", expectedVersion: 1 })).rejects.toMatchObject({
      message: "Game version conflict", status: 409, code: GAME_VERSION_CONFLICT,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("broken", { status: 502 })));
    await expect(api.games.get({ gameId: "game" })).rejects.toEqual(new HttpError("Request failed", 502));
  });
  it("rejects responses aborted while decoding, even if fetch resolves", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => {
      controller.abort();
      return { game };
    } }));
    await expect(api.games.get({ gameId: "game" }, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});

// Checked by tsc; never invoked. No caller-selected response generic exists.
function compileTimeContracts() {
  // @ts-expect-error mutation version is required
  api.games.submitAction({ gameId: "game", action: { type: "fold" } });
  // @ts-expect-error bot version is required
  api.games.stepBot({ gameId: "game" });
  // @ts-expect-error unsupported action
  api.games.submitAction({ gameId: "game", expectedVersion: 1, action: { type: "all_in" } });
  // @ts-expect-error bet amount is required
  api.games.submitAction({ gameId: "game", expectedVersion: 1, action: { type: "bet" } });
  // @ts-expect-error raise amount is required
  api.games.submitAction({ gameId: "game", expectedVersion: 1, action: { type: "raise" } });
  // @ts-expect-error no arbitrary response generic
  api.games.get<{ arbitrary: true }>({ gameId: "game" });
  api.games.submitAction({ gameId: "game", expectedVersion: 1, action: { type: "call" } });
}
void compileTimeContracts;
