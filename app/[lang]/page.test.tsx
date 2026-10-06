import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SUPPORTED_LOCALES } from "@/lib/i18n";
import * as dictionaries from "@/lib/i18n/server";
import Home from "./page";

vi.mock("next/image", () => ({
  default: () => <span>AI Hold&apos;em logo</span>,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

const escapedText = (text: string) => renderToStaticMarkup(<>{text}</>);

async function renderHome(lang: string) {
  return renderToStaticMarkup(
    await Home({
      params: Promise.resolve({ lang }),
      searchParams: Promise.resolve({}),
    }),
  );
}

function readFaq(markup: string) {
  const scripts = [...markup.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  return scripts.map((match) => JSON.parse(match[1])).find((value) => value["@type"] === "FAQPage");
}

describe("localized landing content", () => {
  it.each(SUPPORTED_LOCALES)("renders semantic content and matching FAQ schema for %s", async (locale) => {
    const landing = await dictionaries.getLandingServerDictionary(locale);
    const markup = await renderHome(locale);
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(markup).toContain("AI Hold&#x27;em</h1>");
    expect(markup.match(/<h2\b/g)).toHaveLength(3);
    expect(markup.match(/<h3\b/g)).toHaveLength(4);
    for (const [id, section] of Object.entries({ play: landing.content.play, bots: landing.content.bots, faq: landing.content.faq })) {
      expect(markup).toContain(`<section aria-labelledby="${id}-heading"><h2 id="${id}-heading">${escapedText(section.title)}</h2>`);
    }
    expect(markup).toContain(`<p>${escapedText(landing.content.play.intro)}</p>`);
    expect(markup).toContain(`<p>${escapedText(landing.content.play.tables)}</p>`);
    expect(markup).toContain(`<p>${escapedText(landing.content.bots.description)}</p>`);
    expect(markup).toContain(`<a href="/${locale}/about">${escapedText(landing.content.bots.aboutLink)}</a>`);
    expect(markup.indexOf('id="play-heading"')).toBeGreaterThan(markup.indexOf('</nav>'));
    expect(markup).toContain(`action="/${locale}/quick-game"`);
    expect(markup).not.toContain(`action="/${locale}/new-game"`);
    expect(markup).toContain(`href="/${locale}/play"`);
    const items = Object.values(landing.content.faq.items);
    for (const { question, answer } of items) {
      expect(question.trim()).not.toBe("");
      expect(answer.trim()).not.toBe("");
      expect(markup).toContain(`<h3>${escapedText(question)}</h3><p>${escapedText(answer)}</p>`);
    }
    expect(readFaq(markup)).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map(({ question, answer }) => ({
        "@type": "Question", name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    });
  });

  it("escapes HTML delimiters in FAQ structured data", async () => {
    const landing = await dictionaries.getLandingServerDictionary("en-US");
    const answer = "Virtual chips </script><script>alert(1)</script>";
    vi.spyOn(dictionaries, "getLandingServerDictionary").mockResolvedValue({
      ...landing,
      content: { ...landing.content, faq: { ...landing.content.faq, items: {
        ...landing.content.faq.items, money: { ...landing.content.faq.items.money, answer },
      } } },
    });
    const markup = await renderHome("en-US");
    expect(markup).not.toContain(answer);
    expect(readFaq(markup).mainEntity[3].acceptedAnswer.text).toBe(answer);
  });
});

describe("homepage", () => {
  it("renders the focused game launcher and compact resource navigation", async () => {
    const html = await renderHome("en-US");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/<h2/g)).toHaveLength(3);
    expect(html.match(/<h3/g)).toHaveLength(4);
    expect(html).toContain('href="/en-US/about"');
    expect(html).toContain('href="/en-US/developers"');
    expect(html).toContain("https://github.com/jonime/ai-holdem");
    expect(html).not.toContain("https://typesafe.ai/");
    expect(html).not.toContain("@hivetech/poker-engine");
    expect(html).toContain(
      "Play Texas Hold’em against AI bots, invite friends, or watch bots play.",
    );
    expect(html).toContain(
      "Jump into a private six-seat game against five bots, or customize your own table.",
    );
    expect(html).toContain('<form action="/en-US/quick-game" method="post">');
    expect(html).not.toContain('<form action="/en-US/new-game" method="post">');
    expect(html).toContain('href="/en-US/play"');
    expect(html).toContain('type="submit"');
    expect(html).not.toContain("<input");
  });

  it("renders a localized no-JavaScript language menu", async () => {
    const html = await renderHome("fi-FI");

    expect(html).toContain("Kieli: Suomi");
    expect(html).toContain('href="/en-US"');
    expect(html).toContain('href="/fi-FI"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('action="/fi-FI/quick-game"');
    expect(html).not.toContain('action="/fi-FI/new-game"');
    expect(html).toContain(
      "Pelaa Texas Hold’emia tekoälybotteja vastaan, kutsu ystäviä tai katso bottien peliä.",
    );
    expect(html).toContain(
      "Hyppää heti yksityiseen kuuden paikan peliin viittä bottia vastaan tai mukauta oma pöytäsi.",
    );
    expect(html).toContain("Pikapeli tekoälyä vastaan");
    expect(html).toContain('href="/fi-FI/play">Pelaa</a>');
    expect(html).not.toContain("Liity julkiseen pöytään");
  });
});
