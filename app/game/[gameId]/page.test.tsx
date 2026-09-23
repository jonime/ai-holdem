import { beforeEach, describe, expect, it, vi } from "vitest";

const { GameNotFoundErrorMock, getPublicGameMock, notFoundMock } = vi.hoisted(
  () => ({
    GameNotFoundErrorMock: class GameNotFoundError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "GameNotFoundError";
      }
    },
    getPublicGameMock: vi.fn(),
    notFoundMock: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({
  notFound: (...args: unknown[]) => notFoundMock(...args),
}));

vi.mock("@/lib/poker/game-service", () => ({
  GameNotFoundError: GameNotFoundErrorMock,
  getPublicGame: (...args: unknown[]) => getPublicGameMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseGameRepository: vi.fn(() => ({ getGame: vi.fn() })),
}));

vi.mock("@/components/poker/PokerApp", () => ({
  default: ({ gameId }: { gameId?: string }) => (
    <div data-testid="poker-app">gameId={gameId}</div>
  ),
}));

import { GamePageContent } from "./GamePageContent";

describe("GamePageContent", () => {
  beforeEach(() => {
    notFoundMock.mockReset();
    getPublicGameMock.mockReset();
  });

  it("redirects to notFound for an unknown game id", async () => {
    getPublicGameMock.mockRejectedValue(new GameNotFoundErrorMock("missing"));

    await GamePageContent({ params: Promise.resolve({ gameId: "missing" }) });

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });
});
