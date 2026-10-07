import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { api, HttpError } from "./api";
import { GAME_VERSION_CONFLICT, botFailureCodes, type GetGameResponse, type StepBotResponse, type SubmitActionResponse } from "./gameplay-contracts";
import { gameplayGame as game, gameplayDecision as aiDecision } from "@/test/fixtures/gameplay";

afterEach(() => vi.unstubAllGlobals());
function mockResponse(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("posts English rules Quick Play directly to the unprefixed endpoint", async () => {
  const fetch = mockResponse({ gameId: "new-game" }, 201);
  await api.creation.quickPlay({ lang: "en-US", botMode: "rules" });
  expect(fetch).toHaveBeenCalledWith("/quick-game?botMode=rules", expect.objectContaining({ method: "POST", headers: { Accept: "application/json" }, credentials: "same-origin" }));
});

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
  it.each(Object.values(botFailureCodes))("carries %s through HttpError", async code => {
    mockResponse({ error: "AI decision failed", code }, 502);
    await expect(api.games.stepBot({ gameId: "game", expectedVersion: 1 })).rejects.toMatchObject({
      status: 502, code, message: "AI decision failed",
    });
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

// Every named method goes through the same success validation and transport.
const seat = { gameId: "game-1", seat: 0, status: "claimed", controller: "human", playerToken: "owner", isHost: true };
const methods = [
  { name: "start", run: (signal?: AbortSignal) => api.games.start({ gameId: "game-1", expectedVersion: 2 }, { signal }), path: "/api/games/game-1/start", method: "POST", body: { expectedVersion: 2 }, response: { game } },
  { name: "nextHand", run: (signal?: AbortSignal) => api.games.nextHand({ gameId: "game-1", expectedVersion: 2 }, { signal }), path: "/api/games/game-1/next-hand", method: "POST", body: { expectedVersion: 2 }, response: { game } },
  { name: "reveal", run: (signal?: AbortSignal) => api.games.reveal({ gameId: "game-1", expectedVersion: 2, handNumber: 1 }, { signal }), path: "/api/games/game-1/reveal", method: "POST", body: { expectedVersion: 2, handNumber: 1 }, response: { game } },
  { name: "settings", run: (signal?: AbortSignal) => api.games.settings({ gameId: "game-1", expectedVersion: 2, seatCount: 6, smallBlind: 25, bigBlind: 50, startingStack: 5000, botsShowUncontestedWins: true }, { signal }), path: "/api/games/game-1/settings", method: "PATCH", body: { seatCount: 6, smallBlind: 25, bigBlind: 50, startingStack: 5000, botsShowUncontestedWins: true, expectedVersion: 2 }, response: { game } },
  { name: "seatCount", run: (signal?: AbortSignal) => api.games.seatCount({ gameId: "game-1", expectedVersion: 2, seatCount: 4 }, { signal }), path: "/api/games/game-1/seat-count", method: "PATCH", body: { expectedVersion: 2, seatCount: 4 }, response: { game } },
  { name: "claim", run: (signal?: AbortSignal) => api.seats.claim({ gameId: "game-1", seat: 0, expectedVersion: 2, name: "Ada" }, { signal }), path: "/api/games/game-1/seats/0/claim", method: "POST", body: { expectedVersion: 2, name: "Ada" }, response: { seat } },
  { name: "release", run: (signal?: AbortSignal) => api.seats.release({ gameId: "game-1", seat: 0, expectedVersion: 2 }, { signal }), path: "/api/games/game-1/seats/0/release", method: "POST", body: { expectedVersion: 2 }, response: { seat } },
  { name: "rename", run: (signal?: AbortSignal) => api.seats.rename({ gameId: "game-1", seat: 0, name: "Ada" }, { signal }), path: "/api/games/game-1/seats/0/name", method: "PATCH", body: { name: "Ada" }, response: { seat } },
  { name: "assignBot", run: (signal?: AbortSignal) => api.seats.assignBot({ gameId: "game-1", seat: 0, expectedVersion: 2, botId: "jev", difficulty: "medium" }, { signal }), path: "/api/games/game-1/seats/0/assign-bot", method: "POST", body: { expectedVersion: 2, botId: "jev", difficulty: "medium" }, response: { seat } },
  { name: "custom", run: (signal?: AbortSignal) => api.creation.custom({ seatCount: 4, hostName: "Ada" }, { signal }), path: "/api/games", method: "POST", body: { seatCount: 4, hostName: "Ada" }, response: { gameId: "new-game" } },
  { name: "quickPlay", run: (signal?: AbortSignal) => api.creation.quickPlay({ lang: "fi-FI" }, { signal }), path: "/fi-FI/quick-game", method: "POST", response: { gameId: "new-game" } },
  { name: "catalog", run: (signal?: AbortSignal) => api.bots.catalog({ signal }), path: "/api/bots", response: { bots: [] } },
  { name: "feed", run: (signal?: AbortSignal) => api.games.feed({ gameId: "game-1", sinceHand: 2 }, { signal }), path: "/api/games/game-1/feed?sinceHand=2", response: { feed: { events: [] } } },
  { name: "list", run: (signal?: AbortSignal) => api.discovery.list({ cursor: "a/b +?=" }, { signal }), path: "/api/games/public?cursor=a%2Fb+%2B%3F%3D", response: { games: [], nextCursor: null } },
  { name: "join", run: (signal?: AbortSignal) => api.discovery.join({ gameId: "game-1", expectedVersion: 2, name: "Ada" }, { signal }), path: "/api/games/game-1/join", method: "POST", body: { expectedVersion: 2, name: "Ada" }, response: { gameId: "game-1", seat: 1, version: 3 } },
  { name: "publication", run: (signal?: AbortSignal) => api.discovery.publication({ gameId: "game-1", expectedVersion: 2, isPublic: true, title: "  Title  " }, { signal }), path: "/api/games/game-1/publication", method: "PATCH", body: { expectedVersion: 2, isPublic: true, title: "  Title  " }, response: { version: 3 } },
  { name: "heartbeat", run: (signal?: AbortSignal) => api.discovery.heartbeat({ gameId: "game-1" }, { signal }), path: "/api/games/game-1/heartbeat", method: "POST", response: { renewed: true } },
];
it.each(methods)("serializes $name and forwards cancellation and credentials", async endpoint => {
  const fetch = mockResponse(endpoint.response);
  const signal = new AbortController().signal;
  await endpoint.run(signal);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith(endpoint.path, expect.objectContaining({ signal, credentials: "same-origin", ...(endpoint.method ? { method: endpoint.method } : { cache: "no-store" }) }));
  const init = fetch.mock.calls[0][1];
  if ("body" in endpoint) expect(JSON.parse(init.body)).toEqual(endpoint.body);
  else expect(init.body).toBeUndefined();
  if (endpoint.name === "quickPlay") expect(init.headers).toEqual({ Accept: "application/json" });
});
it.each(methods)("rejects invalid successful $name payloads", async endpoint => {
  mockResponse({});
  await expect(endpoint.run()).rejects.toThrow("Invalid response payload");
});
it.each([[409, "GAME_CONFLICT"], [410, "GAME_UNAVAILABLE"], [409, "LISTING_NOT_RENEWABLE"], [403, undefined]])("preserves HTTP %s code %s", async (status, code) => {
  mockResponse({ error: "Rejected", ...(code ? { code } : {}) }, status);
  await expect(api.discovery.heartbeat({ gameId: "game-1" })).rejects.toEqual(new HttpError("Rejected", status, code));
});
it("retains uncoded conflicts and schema-invalid failures", async () => {
  mockResponse({ error: "Not waiting" }, 409);
  await expect(api.games.start({ gameId: "game", expectedVersion: 1 })).rejects.toEqual(new HttpError("Not waiting", 409));
  mockResponse({ error: 123 }, 500);
  await expect(api.games.get({ gameId: "game" })).rejects.toEqual(new HttpError("Request failed", 500));
});
it("forwards fetch abort rejections", async () => {
  const controller = new AbortController(); controller.abort();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(controller.signal.reason));
  await expect(api.games.feed({ gameId: "game" }, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
});

function extendedCompileTimeContracts() {
  // @ts-expect-error start requires a version
  api.games.start({ gameId: "game" });
  // @ts-expect-error next hand requires a version
  api.games.nextHand({ gameId: "game" });
  // @ts-expect-error reveal requires a hand number
  api.games.reveal({ gameId: "game", expectedVersion: 1 });
  // @ts-expect-error settings requires a version
  api.games.settings({ gameId: "game", seatCount: 6, smallBlind: 25, bigBlind: 50, startingStack: 1000, botsShowUncontestedWins: false });
  // @ts-expect-error seat count requires a version
  api.games.seatCount({ gameId: "game", seatCount: 4 });
  // @ts-expect-error claim requires a version
  api.seats.claim({ gameId: "game", seat: 0 });
  // @ts-expect-error release requires a version
  api.seats.release({ gameId: "game", seat: 0 });
  // @ts-expect-error bot assignment requires a version
  api.seats.assignBot({ gameId: "game", seat: 0 });
  // @ts-expect-error join requires a version
  api.discovery.join({ gameId: "game" });
  // @ts-expect-error publication requires a version
  api.discovery.publication({ gameId: "game", isPublic: true });
  // @ts-expect-error seat is numeric
  api.seats.rename({ gameId: "game", seat: "0", name: "Ada" });
  // @ts-expect-error unsupported difficulty
  api.seats.assignBot({ gameId: "game", seat: 0, expectedVersion: 1, difficulty: "impossible" });
  // @ts-expect-error unsupported playstyle
  api.seats.assignBot({ gameId: "game", seat: 0, expectedVersion: 1, botProfileId: "loose" });
  // @ts-expect-error wrong configuration value
  api.discovery.publication({ gameId: "game", expectedVersion: 1, isPublic: "yes" });
  // @ts-expect-error wrong creation value
  api.creation.custom({ seatCount: "6" });
  // @ts-expect-error unexpected request field
  api.creation.custom({ secret: "private" });
  // @ts-expect-error rename does not accept a version
  api.seats.rename({ gameId: "game", seat: 0, name: "Ada", expectedVersion: 1 });
  // @ts-expect-error heartbeat does not accept a version
  api.discovery.heartbeat({ gameId: "game", expectedVersion: 1 });
  // @ts-expect-error no caller-supplied response generic
  api.games.feed<{ private: true }>({ gameId: "game" });
  // @ts-expect-error unknown query
  api.games.feed({ gameId: "game", hand: 1 });
  expectTypeOf(api.games.start).returns.resolves.toExtend<SubmitActionResponse>();
  expectTypeOf(api.games.nextHand).returns.resolves.toExtend<SubmitActionResponse>();
  expectTypeOf(api.games.reveal).returns.resolves.toExtend<SubmitActionResponse>();
  expectTypeOf(api.creation.custom).returns.resolves.toEqualTypeOf<{ gameId: string }>();
  expectTypeOf(api.discovery.join).returns.resolves.toEqualTypeOf<{ gameId: string; seat: number; version: number }>();
  expectTypeOf(api.discovery.heartbeat).returns.resolves.toEqualTypeOf<{ renewed: true }>();
}
void extendedCompileTimeContracts;
it("preserves abort identity when JSON decoding rejects after cancellation", async () => {
  const controller = new AbortController();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => {
    controller.abort();
    throw new Error("decoder interrupted");
  } }));
  await expect(api.games.get({ gameId: "game" }, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
});

it("validates the bounded contention wait and preserves claim-lost errors", async () => {
  mockResponse({ code: "BOT_STEP_IN_PROGRESS", retryAfterMs: 90_000 }, 409);
  await expect(api.games.stepBot({ gameId: "game", expectedVersion: 1 })).rejects.toMatchObject({ status: 409, code: "BOT_STEP_IN_PROGRESS", retryAfterMs: 90_000 });
  for (const retryAfterMs of [undefined, -1, 0, 90_001, 1.5, "1000"]) {
    mockResponse({ code: "BOT_STEP_IN_PROGRESS", retryAfterMs }, 409);
    await expect(api.games.stepBot({ gameId: "game", expectedVersion: 1 })).rejects.toThrow("Invalid error response payload");
  }
  mockResponse({ code: "BOT_STEP_CLAIM_LOST" }, 409);
  await expect(api.games.stepBot({ gameId: "game", expectedVersion: 1 })).rejects.toMatchObject({ code: "BOT_STEP_CLAIM_LOST", status: 409 });
});

it("reads personal summaries with same-origin cookies, no query identity and no cache", async () => {
  const fetch = mockResponse({ games: [] });
  const signal = new AbortController().signal;
  expect(await api.discovery.mine({ signal })).toEqual({ games: [] });
  expect(fetch).toHaveBeenCalledWith("/api/games/mine", { cache: "no-store", credentials: "same-origin", signal });
  mockResponse({ games: [], playerToken: "secret" });
  await expect(api.discovery.mine()).rejects.toThrow("Invalid response payload");
});
