import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";
import { EevoResponseError } from "@/lib/bots/eevo";
import { TypesafeResponseError } from "@/lib/typesafe/types";
import { GameConflictError } from "@/lib/supabase/queries";
import { POST as nextHand } from "./next-hand/route";
import { POST as step } from "./step/route";
import { scheduleGameEvent } from "@/lib/realtime/schedule";

const {
  BotStepForbiddenErrorMock,
  GameNotFoundErrorMock,
  getPublicGameMock,
  startNextHandMock,
  stepBotActionMock,
} = vi.hoisted(() => ({
  BotStepForbiddenErrorMock: class BotStepForbiddenError extends Error {},
  GameNotFoundErrorMock: class GameNotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "GameNotFoundError";
    }
  },
  getPublicGameMock: vi.fn(),
  startNextHandMock: vi.fn(),
  stepBotActionMock: vi.fn(),
}));

vi.mock("@/lib/poker/game-errors", () => ({ GameNotFoundError: GameNotFoundErrorMock }));
vi.mock("@/lib/poker/driver-authorization", () => ({ BotStepForbiddenError: BotStepForbiddenErrorMock }));
vi.mock("@/lib/poker/bot-turn-service", () => ({ stepBotAction: (...args: unknown[]) => stepBotActionMock(...args) }));

vi.mock("@/lib/poker/game-service", () => ({
  getPublicGame: (...args: unknown[]) => getPublicGameMock(...args),
  startNextHand: (...args: unknown[]) => startNextHandMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseGameRepository: vi.fn(() => ({ getGame: vi.fn() })),
}));

vi.mock("@/lib/typesafe/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/typesafe/client")>()),
  TypesafeSystemOneClient: vi.fn(),
}));

vi.mock("@/lib/realtime/schedule", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/realtime/schedule")>()),
  scheduleGameEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("GET /api/games/[gameId]", () => {
  beforeEach(() => {
    getPublicGameMock.mockReset();
  });

  it("returns 404 when the game is missing", async () => {
    getPublicGameMock.mockRejectedValue(new GameNotFoundErrorMock("missing"));

    const response = await GET(
      new Request("http://localhost/api/games/missing"),
      {
        params: Promise.resolve({ gameId: "missing" }),
      },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "Game not found" });
  });
});

describe.each([
  { name: "next-hand", handler: nextHand, service: startNextHandMock },
  { name: "step", handler: step, service: stepBotActionMock },
])("POST /api/games/[gameId]/$name", ({ name, handler, service }) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["host-token", "spectator-token", null])(
    "forwards viewer %s and schedules the committed version",
    async (viewerToken) => {
      const game = {
        id: "game-1",
        version: 2,
        status: "playing",
        poker: {
          street: "preflop",
          legalActions: [{ type: "check" }],
          players: [
            { id: "human", playerToken: "host-token", holeCards: ["As", "Ks"] },
          ],
        },
      };
      service.mockResolvedValue(
        name === "step" ? { game, aiDecision: null } : game,
      );

      const response = await handler(
        new Request(`http://localhost/api/games/game-1/${name}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(viewerToken
              ? { cookie: `ai-holdem-player-id=${viewerToken}` }
              : {}),
          },
          body: JSON.stringify({ expectedVersion: 1 }),
        }),
        { params: Promise.resolve({ gameId: "game-1" }) },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ game });
      expect(service).toHaveBeenCalledWith(
        ...(name === "step"
          ? [
              expect.any(Object),
              expect.any(Object),
              "game-1",
              1,
              viewerToken,
            ]
          : [expect.any(Object), "game-1", 1, viewerToken]),
      );
      expect(scheduleGameEvent).toHaveBeenCalledWith(
        "game-1",
        expect.any(String),
        2,

      );
    },
  );
});

 it("returns forbidden for unauthorized bot steps without broadcasting", async () => {
  vi.clearAllMocks();
  stepBotActionMock.mockRejectedValue(new BotStepForbiddenErrorMock("Forbidden"));
  const response = await step(new Request("http://localhost/api/games/game-1/step", {
    method: "POST", body: JSON.stringify({ expectedVersion: 1 }),
  }), { params: Promise.resolve({ gameId: "game-1" }) });
  expect(response.status).toBe(403);
  expect(scheduleGameEvent).not.toHaveBeenCalled();
});

it.each([
  { operation: "read_game", run: () => GET(new Request("http://localhost/api/games/game-1"), { params: Promise.resolve({ gameId: "game-1" }) }), service: getPublicGameMock, body: { error: "Unable to load game" } },
  { operation: "next_hand", run: () => nextHand(new Request("http://localhost/api/games/game-1/next-hand", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) }), { params: Promise.resolve({ gameId: "game-1" }) }), service: startNextHandMock, body: { error: "Unable to start next hand" } },
  { operation: "step", run: () => step(new Request("http://localhost/api/games/game-1/step", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) }), { params: Promise.resolve({ gameId: "game-1" }) }), service: stepBotActionMock, body: { error: "AI decision failed" } },
])("logs one safe $operation failure without changing the response", async ({ operation, run, service, body }) => {
  service.mockRejectedValue(new Error("PRIVATE_DATABASE_PAYLOAD"));
  const sink = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await run();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(body);
    expect(sink).toHaveBeenCalledExactlyOnceWith({ event: "application_request_failed", operation, category: "unexpected", status: 500, requestReference: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  } finally { sink.mockRestore(); }
});

it("does not log expected missing-game or authorization errors", async () => {
  const sink = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    getPublicGameMock.mockRejectedValue(new GameNotFoundErrorMock("secret"));
    expect((await GET(new Request("http://localhost/api/games/game-1"), { params: Promise.resolve({ gameId: "game-1" }) })).status).toBe(404);
    stepBotActionMock.mockRejectedValue(new BotStepForbiddenErrorMock("Forbidden"));
    expect((await step(new Request("http://localhost/api/games/game-1/step", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) }), { params: Promise.resolve({ gameId: "game-1" }) })).status).toBe(403);
    expect(sink).not.toHaveBeenCalled();
  } finally { sink.mockRestore(); }
});


it.each([TypesafeResponseError, EevoResponseError])("preserves %s provider diagnostics without a generic duplicate", async ErrorType => {
  stepBotActionMock.mockRejectedValue(new ErrorType("PRIVATE_PROVIDER_PAYLOAD"));
  const sink = vi.spyOn(console, "error").mockImplementation(() => {});
  const providerSink = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const response = await step(new Request("http://localhost/api/games/game-1/step", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) }), { params: Promise.resolve({ gameId: "game-1" }) });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "AI decision failed", code: "BOT_INVALID_RESPONSE" });
    expect(sink).not.toHaveBeenCalled();
    expect(providerSink).toHaveBeenCalledTimes(1);
    expect(JSON.parse(providerSink.mock.calls[0][1])).toMatchObject({ category: "invalid_response", reason: ErrorType === EevoResponseError ? "eevo_response" : "typesafe_response" });
    expect(JSON.stringify(providerSink.mock.calls)).not.toContain("PRIVATE_PROVIDER_PAYLOAD");
  } finally { sink.mockRestore(); providerSink.mockRestore(); }
});

it("keeps version conflicts silent", async () => {
  startNextHandMock.mockRejectedValue(new GameConflictError("game-1", 1));
  const sink = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await nextHand(new Request("http://localhost/api/games/game-1/next-hand", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) }), { params: Promise.resolve({ gameId: "game-1" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Game version conflict" });
    expect(sink).not.toHaveBeenCalled();
  } finally { sink.mockRestore(); }
});

it("preserves the original HTTP failure if the logging sink throws", async () => {
  getPublicGameMock.mockRejectedValue(new Error("PRIVATE_DATABASE_PAYLOAD"));
  const sink = vi.spyOn(console, "error").mockImplementation(() => { throw Error("SINK_FAILURE"); });
  try {
    const response = await GET(new Request("http://localhost/api/games/game-1"), { params: Promise.resolve({ gameId: "game-1" }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to load game" });
  } finally { sink.mockRestore(); }
});
