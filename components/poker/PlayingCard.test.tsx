import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import enUsGame from "@/lib/i18n/dictionaries/game/en-US";
import { I18nProvider } from "./I18nProvider";
import { PlayingCard } from "./PlayingCard";
import { InlineCardExample } from "./InlineCardExample";

it("marks all visible suits without changing accessible card names", () => {
  for (const [suit, name, symbol] of [["s", "spades", "♠"], ["h", "hearts", "♥"], ["d", "diamonds", "♦"], ["c", "clubs", "♣"]]) {
    const html = renderToStaticMarkup(<I18nProvider locale="en-US" dictionary={enUsGame}><PlayingCard card={`A${suit}`} /></I18nProvider>);
    expect(html).toContain(`data-suit="${suit}"`);
    expect(html).toContain(`aria-label="A of ${name}"`);
    expect(html).toContain(symbol);
  }
});
it("leaves backs and placeholders without suit styling", () => {
  const html = renderToStaticMarkup(<I18nProvider locale="en-US" dictionary={enUsGame}><PlayingCard card="Ad" hidden /><PlayingCard /></I18nProvider>);
  expect(html).not.toContain("data-suit");
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('aria-label="Hidden card"');
});
it("renders compact server Help examples with ranks and suit symbols", () => {
  const html = renderToStaticMarkup(<InlineCardExample cards="A♠" />);
  expect(html).toContain("A♠");
  const symbols = renderToStaticMarkup(<InlineCardExample cards="A♠ K♥ Q♦ J♣" />);
  for (const suit of ["s", "h", "d", "c"]) expect(symbols).toContain(`data-suit="${suit}"`);
});
