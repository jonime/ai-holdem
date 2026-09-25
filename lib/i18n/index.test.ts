import { describe, expect, it } from "vitest";

import {
  addLocalePrefix,
  DEFAULT_LOCALE,
  hasLocale,
  removeLocalePrefix,
} from "./index";

describe("i18n routing helpers", () => {
  it("recognizes the supported locales and canonicalizes paths", () => {
    expect(hasLocale(DEFAULT_LOCALE)).toBe(true);
    expect(hasLocale("fi-FI")).toBe(true);
    expect(hasLocale("es-ES")).toBe(true);
    expect(hasLocale("de-DE")).toBe(true);
    expect(hasLocale("sv-SE")).toBe(true);
    expect(hasLocale("fr-FR")).toBe(true);
    expect(hasLocale("pt-BR")).toBe(true);
    expect(hasLocale("it-IT")).toBe(true);
    expect(hasLocale("nl-NL")).toBe(true);
    expect(hasLocale("pl-PL")).toBe(true);
    expect(hasLocale("ja-JP")).toBe(false);
    expect(addLocalePrefix("/game/example", DEFAULT_LOCALE)).toBe(
      "/en-US/game/example",
    );
    expect(addLocalePrefix("/en-US", DEFAULT_LOCALE)).toBe("/en-US");
    expect(removeLocalePrefix("/en-US/game/example")).toBe("/game/example");
    expect(removeLocalePrefix("/en-US")).toBe("/");
  });
});
