import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import enUsGame from "@/lib/i18n/dictionaries/game/en-US";
import fiFiGame from "@/lib/i18n/dictionaries/game/fi-FI";

import type { GameTranslationKey } from "@/lib/i18n/types";

import { I18nProvider, useI18n } from "./I18nProvider";

function Probe({
  translationKey,
  values,
}: {
  translationKey: GameTranslationKey;
  values?: Record<string, string | number>;
}) {
  const { locale, t } = useI18n();
  return (
    <span data-locale={locale}>{t(translationKey, values)}</span>
  );
}

describe("I18nProvider", () => {
  it("interpolates values into the selected locale's strings", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en-US" dictionary={enUsGame}>
        <Probe translationKey="table.hand" values={{ hand: 3 }} />
      </I18nProvider>,
    );

    expect(html).toContain("data-locale=\"en-US\"");
    expect(html).toContain(">Hand 3</span>");
  });

  it("interpolates strings and preserves zero", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en-US" dictionary={enUsGame}>
        <Probe translationKey="table.wonTable" values={{ name: "Alice" }} />
        <Probe translationKey="table.hand" values={{ hand: 0 }} />
      </I18nProvider>,
    );
    expect(html).toContain("Alice");
    expect(html).toContain(">Hand 0</span>");
  });

  it("serves Finnish values for the Finnish game dictionary", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="fi-FI" dictionary={fiFiGame}>
        <Probe translationKey="table.hand" values={{ hand: 3 }} />
      </I18nProvider>,
    );

    expect(html).toContain("data-locale=\"fi-FI\"");
    expect(html).toContain(`>${fiFiGame.table.hand.replaceAll("{hand}", "3")}</span>`);
  });

  it("falls back to the key itself when a translation is missing", () => {
    // Simulate malformed data at runtime while keeping the public call valid.
    const malformedDictionary = { ...enUsGame, table: { ...enUsGame.table } };
    Reflect.deleteProperty(malformedDictionary.table, "hand");
    const html = renderToStaticMarkup(
      <I18nProvider locale="en-US" dictionary={malformedDictionary}>
        <Probe translationKey="table.hand" />
      </I18nProvider>,
    );

    expect(html).toContain(">table.hand</span>");
  });

  it.each([undefined, { unrelated: 0 }])("preserves placeholders when interpolation values are missing (%s)", (values) => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en-US" dictionary={enUsGame}>
        <Probe translationKey="table.hand" values={values} />
      </I18nProvider>,
    );
    expect(html).toContain(">Hand {hand}</span>");
  });

  it("throws when consumed outside the provider", () => {
    expect(() => renderToStaticMarkup(<Probe translationKey="table.hand" />)).toThrow(
      "useI18n must be used inside I18nProvider",
    );
  });
});
