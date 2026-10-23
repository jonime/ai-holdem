import { readFile } from "node:fs/promises";
import { evaluate } from "@mdx-js/mdx";
import { createElement } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { getGameDictionary } from "@/lib/i18n/server";
import { InlineCardExample } from "@/components/poker/InlineCardExample";
import { evaluateVisibleCards } from "@/lib/poker/adapter";

const sections = {
  "en-US": ["Hand rankings", "Betting basics", "Keyboard shortcuts", "Review hand"],
  "fi-FI": ["Käsien arvojärjestys", "Panostamisen perusteet", "Pikanäppäimet", "Jaon tarkastelu"],
  "es-ES": ["Clasificación de manos", "Conceptos básicos de apuestas", "Atajos de teclado", "Revisar mano"],
  "de-DE": ["Rangfolge der Hände", "Grundlagen des Setzens", "Tastenkürzel", "Hand ansehen"],
  "sv-SE": ["Handrankning", "Grunder för satsningar", "Kortkommandon", "Granska hand"],
  "fr-FR": ["Classement des mains", "Bases des mises", "Raccourcis clavier", "Revoir la main"],
  "pt-BR": ["Classificação das mãos", "Noções básicas de apostas", "Atalhos de teclado", "Rever mão"],
  "it-IT": ["Classifica delle mani", "Nozioni di puntata", "Scorciatoie da tastiera", "Rivedi mano"],
  "nl-NL": ["Rangorde van handen", "Basis van inzetten", "Sneltoetsen", "Hand bekijken"],
  "pl-PL": ["Ranking układów", "Podstawy licytacji", "Skróty klawiaturowe", "Przegląd rozdania"],
  "ja-JP": ["役の強さ", "ベットの基本", "キーボードショートカット", "ハンドの振り返り"],
  "zh-Hans": ["牌型大小", "下注基础", "键盘快捷键", "回顾牌局"],
};
const categories = ["straight-flush", "four-of-a-kind", "full-house", "flush", "straight", "three-of-a-kind", "two-pair", "one-pair", "high-card"];
const suits: Record<string, string> = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };

describe("localized Help documents", () => {
  it.each(SUPPORTED_LOCALES)("compiles a complete %s document with correctly ranked five-card examples", async locale => {
    const source = await readFile(new URL(`../../content/help/${locale}.mdx`, import.meta.url), "utf8");
    const componentImport = 'import { InlineCardExample } from "@/components/poker/InlineCardExample";';
    const dictionaryImport = `import dictionary from "@/lib/i18n/dictionaries/game/${locale}";`;
    expect(source.split("\n").filter(line => line.startsWith("import "))).toEqual([dictionaryImport, componentImport]);
    const dictionary = await getGameDictionary(locale);
    const document = await evaluate(source.replace(componentImport, "").replace(dictionaryImport, "").replaceAll("dictionary.cards", JSON.stringify(dictionary.cards)), runtime);
    expect(typeof document.title).toBe("string");
    expect(document.title).not.toBe("");
    if (locale !== "en-US") expect(document.title).not.toBe("Game help");
    const html = renderToStaticMarkup(createElement(document.default, { components: { InlineCardExample } }));
    expect([...html.matchAll(/<h2\b[^>]*>(.*?)<\/h2>/g)].map(match => match[1])).toEqual([dictionary.shareTable.title, ...sections[locale], dictionary.sharing.title, dictionary.results.title]);
    for (let index = 0; index < 7; index++) {
      expect(html).toContain(`href="#help-section-${index}"`);
      expect(html).toContain(`id="help-section-${index}"`);
    }
    expect(html).toContain("<ol>");
    expect(html).not.toContain("<table");
    expect(html.match(/data-card-example/g)).toHaveLength(14);
    for (const suit of ["s", "h", "d", "c"]) expect(html).toContain(`data-suit="${suit}"`);
    expect(source).not.toContain("use client");
    const examples = [...source.matchAll(/^\d+\. .*?<InlineCardExample labels={dictionary.cards} cards="([^"]+)"/gm)];
    expect(examples).toHaveLength(categories.length);
    examples.forEach((match, index) => {
      const cards = match[1].split(" ");
      expect(cards).toHaveLength(5);
      expect(new Set(cards).size).toBe(5);
      cards.forEach(card => expect(card).toMatch(/^(10|[2-9AJQK])[♠♥♦♣]$/));
      const engineCards = cards.map(card => card.slice(0, -1).replace("10", "T") + suits[card.slice(-1)]);
      expect(evaluateVisibleCards([], engineCards).category).toBe(categories[index]);
    });
    expect(source).toContain("A♠ K♠ Q♠ J♠ 10♠");
    expect(evaluateVisibleCards([], ["As", "Ks", "Qs", "Js", "Ts"])).toMatchObject({ category: "straight-flush", tiebreak: [14] });
    expect(source).toContain("600 − 100");
    for (const label of [dictionary.table.fold, dictionary.table.check,
      dictionary.table.call.replace("{amount}", "").trim(),
      dictionary.actions.bet, dictionary.actions.raise, dictionary.table.allIn]) {
      expect(source).toContain(label);
    }
    expect(source).toContain(dictionary.replay.yourTurn);
    for (const key of ["A", "S", "D", "Q", "E", "←", "→", "Shift", "Ctrl/Alt/Meta"]) expect(source).toContain(key);
  });

  it("registers every locale explicitly behind the server boundary", async () => {
    const loader = await readFile(new URL("./server.ts", import.meta.url), "utf8");
    expect(loader).toContain('import "server-only"');
    for (const locale of SUPPORTED_LOCALES) expect(loader).toContain(`"${locale}": () => import("@/content/help/${locale}.mdx")`);
    expect(loader.match(/=> import\(/g)).toHaveLength(SUPPORTED_LOCALES.length);
    const client = await readFile(new URL("../../components/poker/PokerApp.tsx", import.meta.url), "utf8");
    expect(client).not.toMatch(/import.*(?:content\/help|lib\/help\/server)/);
    const english = await readFile(new URL("../../app/(english)/game/[gameId]/page.tsx", import.meta.url), "utf8");
    expect(english).toContain("lang: DEFAULT_LOCALE");
    expect(english).toContain("<GamePageContent");
  });
});
