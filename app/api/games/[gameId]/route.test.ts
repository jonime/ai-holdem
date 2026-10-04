import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";
import { POST as nextHand } from "./next-hand/route";
import { POST as step } from "./step/route";
import { scheduleGameEvent } from "@/lib/realtime/schedule";

const {
  BotStepForbiddenErrorMock,
  GameNotFoundErrorMock,
  getPublicGameMock,
  startNextHandMock,
  stepTypesafeActionMock,
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
  stepTypesafeActionMock: vi.fn(),
}));

vi.mock("@/lib/poker/game-service", () => ({
  GameNotFoundError: GameNotFoundErrorMock,
  BotStepForbiddenError: BotStepForbiddenErrorMock,
  getPublicGame: (...args: unknown[]) => getPublicGameMock(...args),
  startNextHand: (...args: unknown[]) => startNextHandMock(...args),
  stepTypesafeAction: (...args: unknown[]) => stepTypesafeActionMock(...args),
  stepBotAction: (...args: unknown[]) => stepTypesafeActionMock(...args),
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
  { name: "step", handler: step, service: stepTypesafeActionMock },
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
  stepTypesafeActionMock.mockRejectedValue(new BotStepForbiddenErrorMock("Forbidden"));
  const response = await step(new Request("http://localhost/api/games/game-1/step", {
    method: "POST", body: JSON.stringify({ expectedVersion: 1 }),
  }), { params: Promise.resolve({ gameId: "game-1" }) });
  expect(response.status).toBe(403);
  expect(scheduleGameEvent).not.toHaveBeenCalled();
});
