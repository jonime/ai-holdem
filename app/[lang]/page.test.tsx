import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: () => <span>AI Hold&apos;em logo</span>,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import Home from "./page";

async function renderHome(locale: "en-US" | "fi-FI"): Promise<string> {
  return renderToStaticMarkup(
    await Home({
      params: Promise.resolve({ lang: locale }),
      searchParams: Promise.resolve({}),
    }),
  );
}

describe("homepage", () => {
  it("renders the focused game launcher and compact resource navigation", async () => {
    const html = await renderHome("en-US");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("<h3");
    expect(html).toContain('href="/en-US/about"');
    expect(html).toContain('href="/en-US/developers"');
    expect(html).toContain("https://github.com/jonime/ai-holdem");
    expect(html).not.toContain("https://typesafe.ai/");
    expect(html).not.toContain("https://openrouter.ai/");
    expect(html).not.toContain("@hivetech/poker-engine");
    expect(html).toContain('<form action="/en-US/new-game" method="post">');
    expect(html).toContain('type="submit"');
    expect(html).not.toContain("<input");
  });

  it("renders a localized no-JavaScript language menu", async () => {
    const html = await renderHome("fi-FI");

    expect(html).toContain("Kieli: Suomi");
    expect(html).toContain('href="/en-US"');
    expect(html).toContain('href="/fi-FI"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('action="/fi-FI/new-game"');
    expect(html).toContain("Uusi peli");
  });
});
