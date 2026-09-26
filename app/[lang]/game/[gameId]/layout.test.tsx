import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { providerCaptures, i18nStore, resolveKey } = vi.hoisted(() => {
  const resolveKey = (
    dictionary: Record<string, unknown>,
    key: string,
  ): string => {
    const value = key.split(".").reduce<unknown>(
      (current, part) =>
        current !== null && typeof current === "object"
          ? (current as Record<string, unknown>)[part]
          : undefined,
      dictionary,
    );
    return typeof value === "string" ? value : key;
  };

  return {
    providerCaptures: [] as Array<{
      locale: string;
      dictionary: Record<string, unknown>;
    }>,
    i18nStore: {
      value: null as null | { locale: string; t: (key: string) => string },
    },
    resolveKey,
  };
});

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/components/poker/GameHeader", () => ({
  GameHeader: () => <header>game-header</header>,
}));
vi.mock("@/components/poker/I18nProvider", () => ({
  I18nProvider: (props: {
    locale: string;
    dictionary: Record<string, unknown>;
    children: React.ReactNode;
  }) => {
    providerCaptures.push({ locale: props.locale, dictionary: props.dictionary });
    i18nStore.value = {
      locale: props.locale,
      t: (key: string) => resolveKey(props.dictionary, key),
    };
    return <div data-testid="game-i18n">{props.children}</div>;
  },
  useI18n: () => {
    const value = i18nStore.value;
    if (!value) {
      throw new Error("useI18n must be used inside I18nProvider");
    }
    return value;
  },
}));

import enUsGame from "@/lib/i18n/dictionaries/game/en-US";
import fiFiGame from "@/lib/i18n/dictionaries/game/fi-FI";
import { useI18n } from "@/components/poker/I18nProvider";

import GameLayout, { GameI18nBoundary } from "./layout";

const gameTopLevelKeys = [
  "actions",
  "cards",
  "connection",
  "errors",
  "feed",
  "gameHeader",
  "history",
  "lobby",
  "seat",
  "table",
];

const TranslatingChild = () => {
  const { t } = useI18n();
  return <main>{t("connection.live")}</main>;
};

describe("game layout", () => {
  beforeEach(() => {
    providerCaptures.length = 0;
    i18nStore.value = null;
  });

  it.each([
    ["en-US", enUsGame],
    ["fi-FI", fiFiGame],
  ] as const)(
    "%s serves the locale's game dictionary to a provider wrapping header and content",
    async (locale, dictionary) => {
      const boundary = await GameI18nBoundary({
        params: Promise.resolve({ lang: locale, gameId: "table-1" }),
        children: <TranslatingChild />,
      });
      const html = renderToStaticMarkup(boundary);

      expect(html).toContain(
        `<div data-testid="game-i18n"><header>game-header</header><main>${dictionary.connection.live}</main></div>`,
      );
      expect(providerCaptures).toEqual([{ locale, dictionary }]);
      expect(Object.keys(providerCaptures[0].dictionary).sort()).toEqual(
        gameTopLevelKeys,
      );
    },
  );

  it("renders a standalone loading placeholder, not children, while the dictionary loads", () => {
    const html = renderToStaticMarkup(
      GameLayout({
        params: Promise.resolve({ lang: "en-US", gameId: "table-1" }),
        children: <TranslatingChild />,
      }),
    );

    expect(html).toBe('<main aria-busy="true"></main>');
    expect(html).not.toContain("game-i18n");
    expect(html).not.toContain("Live");
    expect(html).not.toContain("Yhteys");
    expect(providerCaptures).toEqual([]);
  });
});