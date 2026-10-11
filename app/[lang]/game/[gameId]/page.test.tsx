import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
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

vi.mock("@/lib/poker/game-errors", () => ({ GameNotFoundError: GameNotFoundErrorMock }));
vi.mock("@/lib/poker/game-service", () => ({
  getPublicGame: (...args: unknown[]) => getPublicGameMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseGameRepository: vi.fn(() => ({ getGame: vi.fn() })),
}));

vi.mock("@/lib/help/server", () => ({
  getHelpDocument: vi.fn(async (locale: string) => ({
    title: `Title ${locale}`,
    default: () => <h2>Document {locale}</h2>,
  })),
}));

vi.mock("@/components/poker/PokerApp", () => ({
  default: ({ gameId, helpTitle, helpContent }: { gameId?: string; helpTitle: string; helpContent: ReactNode }) => (
    <div data-testid="poker-app">gameId={gameId}<h1>{helpTitle}</h1>{helpContent}</div>
  ),
}));

import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { getHelpDocument } from "@/lib/help/server";

import { GamePageContent } from "./GamePageContent";

describe("GamePageContent", () => {
  beforeEach(() => {
    notFoundMock.mockReset();
    notFoundMock.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
    getPublicGameMock.mockReset();
    vi.mocked(createSupabaseGameRepository).mockClear();
    vi.mocked(getHelpDocument).mockClear();
  });

  it.each(SUPPORTED_LOCALES)("passes only selected %s server content into the client slot", async lang => {
    const html = renderToStaticMarkup(await GamePageContent({ params: Promise.resolve({ lang, gameId: "00000000-0000-4000-8000-000000000001" }) }));
    expect(getPublicGameMock).toHaveBeenCalledExactlyOnceWith(expect.any(Object), "00000000-0000-4000-8000-000000000001");
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(getHelpDocument).toHaveBeenCalledExactlyOnceWith(lang);
    expect(html).toContain(`<h1>Title ${lang}</h1><h2>Document ${lang}</h2>`);
  });

  it("uses notFound for an unknown game id", async () => {
    getPublicGameMock.mockRejectedValue(new GameNotFoundErrorMock("missing"));

    await expect(GamePageContent({
      params: Promise.resolve({ lang: "en-US", gameId: "00000000-0000-4000-8000-000000000001" }),
    })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed IDs before constructing persistence", async () => {
    await expect(GamePageContent({ params: Promise.resolve({ lang: "en-US", gameId: "bad-id" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getPublicGameMock).not.toHaveBeenCalled();
    expect(createSupabaseGameRepository).not.toHaveBeenCalled();
  });

  it.each([new Error("database unavailable"), Object.assign(new Error("impostor"), { name: "GameNotFoundError" })])("propagates repository failures: %s", async error => {
    getPublicGameMock.mockRejectedValue(error);
    await expect(GamePageContent({ params: Promise.resolve({ lang: "en-US", gameId: "00000000-0000-4000-8000-000000000001" }) })).rejects.toBe(error);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

});