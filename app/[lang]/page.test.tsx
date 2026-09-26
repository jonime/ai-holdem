import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  selector: [] as unknown[],
  form: [] as unknown[],
}));

vi.mock("next/image", () => ({
  default: () => <span>AI Hold&apos;em logo</span>,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/components/poker/LanguageSelector", () => ({
  LanguageSelector: (props: unknown) => {
    captured.selector.push(props);
    return <div>Language</div>;
  },
}));
vi.mock("@/components/poker/NewGameForm", () => ({
  NewGameForm: (props: unknown) => {
    captured.form.push(props);
    return <button>New Game</button>;
  },
}));

import enUsLandingClient from "@/lib/i18n/dictionaries/landing-client/en-US";
import fiFiLandingClient from "@/lib/i18n/dictionaries/landing-client/fi-FI";
import type { LandingClientDictionary } from "@/lib/i18n/types";

import Home from "./page";

type SelectorProps = Readonly<{ locale: string; label: string }>;
type FormProps = Readonly<{
  locale: string;
  messages: LandingClientDictionary["newGame"];
}>;

async function renderHome(locale: "en-US" | "fi-FI"): Promise<string> {
  return renderToStaticMarkup(
    await Home({
      params: Promise.resolve({ lang: locale }),
      searchParams: Promise.resolve({}),
    }),
  );
}

describe("homepage", () => {
  beforeEach(() => {
    captured.selector.length = 0;
    captured.form.length = 0;
  });

  it("renders substantial content and sequential headings without JavaScript", async () => {
    const html = await renderHome("en-US");
    const text = html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    expect(text.length).toBeGreaterThanOrEqual(500);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>AI Hold&#x27;em<\/h1>[\s\S]*<h2/);
    expect(html).toMatch(/<h2[^>]*>[^<]+<\/h2>[\s\S]*<h3/);
    expect(html).toContain("https://typesafe.ai/");
    expect(html).toContain("https://openrouter.ai/");
    expect(html).toContain(
      "https://www.npmjs.com/package/@hivetech/poker-engine",
    );
    expect(html.match(/https:\/\/typesafe\.ai\//g)).toHaveLength(1);
  });

  it.each([
    ["en-US", enUsLandingClient],
    ["fi-FI", fiFiLandingClient],
  ] as const)(
    "%s passes only narrow landing-client strings across the client boundary",
    async (locale, dictionary) => {
      await renderHome(locale);

      expect(captured.selector).toHaveLength(1);
      expect(captured.form).toHaveLength(1);
      // Deep equality against the landing-client dictionary proves neither
      // component received server prose, the full landing dictionary, or game
      // sections.
      expect(captured.selector).toEqual([
        { locale, label: dictionary.language },
      ]);
      expect(captured.form).toEqual([{ locale, messages: dictionary.newGame }]);

      const [selector] = captured.selector as [SelectorProps];
      expect(typeof selector.label).toBe("string");

      const [form] = captured.form as [FormProps];
      expect(Object.keys(form.messages).sort()).toEqual([
        "anonymous",
        "createGameError",
        "newGame",
        "yourName",
      ]);
      for (const value of Object.values(form.messages)) {
        expect(typeof value).toBe("string");
      }
    },
  );
});
