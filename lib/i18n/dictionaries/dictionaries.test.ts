import { describe, expect, it } from "vitest";

import deDe from "./de-DE";
import enUs from "./en-US";
import esEs from "./es-ES";
import fiFi from "./fi-FI";
import frFr from "./fr-FR";
import itIt from "./it-IT";
import nlNl from "./nl-NL";
import plPl from "./pl-PL";
import ptBr from "./pt-BR";
import svSe from "./sv-SE";

const dictionaries = {
  "de-DE": deDe,
  "en-US": enUs,
  "es-ES": esEs,
  "fi-FI": fiFi,
  "fr-FR": frFr,
  "it-IT": itIt,
  "nl-NL": nlNl,
  "pl-PL": plPl,
  "pt-BR": ptBr,
  "sv-SE": svSe,
};

function placeholderMap(
  value: unknown,
  path = "",
): Record<string, string[]> {
  if (typeof value === "string") {
    const matches = [...value.matchAll(/\{[^}]+\}/g)]
      .map(([match]) => match)
      .sort();
    return matches.length > 0 ? { [path]: matches } : {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      Object.entries(placeholderMap(child, path ? `${path}.${key}` : key)),
    ),
  );
}

describe("translation dictionaries", () => {
  it.each(Object.entries(dictionaries))(
    "%s preserves every interpolation placeholder",
    (_locale, dictionary) => {
      expect(placeholderMap(dictionary)).toEqual(placeholderMap(enUs));
    },
  );

  it.each(Object.entries(dictionaries))(
    "%s keeps linkable product names in the homepage copy",
    (_locale, dictionary) => {
      expect(dictionary.home.engineBody).toContain(
        dictionary.home.engineLinkLabel,
      );
      expect(dictionary.home.privacyBody).toContain("TypeSafe System One");
      expect(dictionary.home.privacyBody).toContain("OpenRouter");
    },
  );
});
