import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mockedNotFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("not-found");
}));

vi.mock("next/navigation", () => ({ notFound: mockedNotFound }));
vi.mock("@/lib/about/server", () => ({
  getAboutDocument: vi.fn(async (locale: string) => ({
    metadata:
      locale === "fi-FI"
        ? { title: "Tietoja", description: "Suomenkielinen kuvaus" }
        : { title: "About", description: "English description" },
    default:
      locale === "fi-FI"
        ? () => (
            <>
              <h1>Tietoja AI Hold&apos;emista</h1>
              <h2>Pokeribotit</h2>
              <a href="../">Aloita peli</a>
            </>
          )
        : () => (
            <>
              <h1>About AI Hold&apos;em</h1>
              <h2>Poker bots</h2>
              <a href="../developers">Developer resources</a>
            </>
          ),
  })),
}));

import AboutPage, { generateMetadata } from "./page";

describe("About page", () => {
  it.each([
    ["en-US", "About AI Hold&#x27;em", "Developer resources"],
    ["fi-FI", "Tietoja AI Hold&#x27;emista", "Aloita peli"],
  ] as const)("renders localized %s server content", async (locale, title, link) => {
    const html = renderToStaticMarkup(
      await AboutPage({ params: Promise.resolve({ lang: locale }) }),
    );

    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).toContain("<h2>");
    expect(html).toContain(link);
    expect(html).toContain(`href="/${locale}"`);
    expect(html).toContain('href="/en-US/about"');
    expect(html).toContain('href="/fi-FI/about"');
    expect(html).toContain(
      `aria-label="${locale === "fi-FI" ? "Kieli: Suomi" : "Language: English"}"`,
    );
  });

  it("provides localized metadata and language alternates", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ lang: "fi-FI" }),
    });

    expect(metadata.title).toBe("Tietoja");
    expect(metadata.description).toBe("Suomenkielinen kuvaus");
    expect(metadata.alternates).toEqual(
      expect.objectContaining({
        canonical: "/fi-FI/about",
        languages: expect.objectContaining({
          "en-US": "/en-US/about",
          "fi-FI": "/fi-FI/about",
        }),
      }),
    );
  });

  it("rejects an unsupported locale", async () => {
    await expect(
      AboutPage({ params: Promise.resolve({ lang: "xx-XX" }) }),
    ).rejects.toThrow("not-found");
  });
});
