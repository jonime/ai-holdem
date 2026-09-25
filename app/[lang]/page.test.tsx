import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: () => <span>AI Hold&apos;em logo</span>,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/components/poker/LanguageSelector", () => ({
  LanguageSelector: () => <div>Language</div>,
}));
vi.mock("@/components/poker/NewGameForm", () => ({
  NewGameForm: () => <button>New Game</button>,
}));

import Home from "./page";

describe("homepage", () => {
  it("renders substantial content and sequential headings without JavaScript", async () => {
    const html = renderToStaticMarkup(
      await Home({
        params: Promise.resolve({ lang: "en-US" }),
        searchParams: Promise.resolve({}),
      }),
    );
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
});
