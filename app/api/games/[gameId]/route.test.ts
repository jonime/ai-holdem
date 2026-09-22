import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const { GameNotFoundErrorMock, getPublicGameMock } = vi.hoisted(() => ({
  GameNotFoundErrorMock: class GameNotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "GameNotFoundError";
    }
  },
  getPublicGameMock: vi.fn(),
}));

vi.mock("@/lib/poker/game-service", () => ({
  GameNotFoundError: GameNotFoundErrorMock,
  getPublicGame: (...args: unknown[]) => getPublicGameMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseGameRepository: vi.fn(() => ({ getGame: vi.fn() })),
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
