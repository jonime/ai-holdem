import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import enUsGame from "@/lib/i18n/dictionaries/game/en-US";
import fiFiGame from "@/lib/i18n/dictionaries/game/fi-FI";

import { I18nProvider, useI18n } from "./I18nProvider";

function Probe({
  translationKey,
  values,
}: {
  translationKey: string;
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
    const html = renderToStaticMarkup(
      <I18nProvider locale="en-US" dictionary={enUsGame}>
        <Probe translationKey="table.doesNotExist" />
      </I18nProvider>,
    );

    expect(html).toContain(">table.doesNotExist</span>");
  });

  it("throws when consumed outside the provider", () => {
    expect(() => renderToStaticMarkup(<Probe translationKey="table.hand" />)).toThrow(
      "useI18n must be used inside I18nProvider",
    );
  });
});
