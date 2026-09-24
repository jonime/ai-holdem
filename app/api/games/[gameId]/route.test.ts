import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";
import { POST as nextHand } from "./next-hand/route";
import { POST as step } from "./step/route";
import { publishGameEvent } from "@/lib/realtime/publish";

const {
  GameNotFoundErrorMock,
  getPublicGameMock,
  startNextHandMock,
  stepTypesafeActionMock,
} = vi.hoisted(() => ({
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

vi.mock("@/lib/realtime/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/realtime/publish")>()),
  publishGameEvent: vi.fn().mockResolvedValue(undefined),
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
    "forwards viewer %s and masks private data in broadcasts",
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
      expect(publishGameEvent).toHaveBeenCalledWith(
        "game-1",
        expect.any(String),
        2,
        expect.objectContaining({
          game: expect.objectContaining({
            poker: expect.objectContaining({
              legalActions: [],
              players: [{ id: "human", playerToken: null, holeCards: null }],
            }),
          }),
        }),
      );
    },
  );
});
