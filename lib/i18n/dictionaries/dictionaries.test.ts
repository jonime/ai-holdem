import { describe, expect, it } from "vitest";

import deDeGame from "./game/de-DE";
import enUsGame from "./game/en-US";
import esEsGame from "./game/es-ES";
import fiFiGame from "./game/fi-FI";
import frFrGame from "./game/fr-FR";
import itItGame from "./game/it-IT";
import nlNlGame from "./game/nl-NL";
import plPlGame from "./game/pl-PL";
import jaJpGame from "./game/ja-JP";
import zhHansGame from "./game/zh-Hans";
import ptBrGame from "./game/pt-BR";
import svSeGame from "./game/sv-SE";
import deDeLandingServer from "./landing-server/de-DE";
import enUsLandingServer from "./landing-server/en-US";
import esEsLandingServer from "./landing-server/es-ES";
import fiFiLandingServer from "./landing-server/fi-FI";
import frFrLandingServer from "./landing-server/fr-FR";
import itItLandingServer from "./landing-server/it-IT";
import nlNlLandingServer from "./landing-server/nl-NL";
import plPlLandingServer from "./landing-server/pl-PL";
import jaJpLandingServer from "./landing-server/ja-JP";
import zhHansLandingServer from "./landing-server/zh-Hans";
import ptBrLandingServer from "./landing-server/pt-BR";
import svSeLandingServer from "./landing-server/sv-SE";
import deDeMetadata from "./metadata/de-DE";
import enUsMetadata from "./metadata/en-US";
import esEsMetadata from "./metadata/es-ES";
import fiFiMetadata from "./metadata/fi-FI";
import frFrMetadata from "./metadata/fr-FR";
import itItMetadata from "./metadata/it-IT";
import nlNlMetadata from "./metadata/nl-NL";
import plPlMetadata from "./metadata/pl-PL";
import jaJpMetadata from "./metadata/ja-JP";
import zhHansMetadata from "./metadata/zh-Hans";
import ptBrMetadata from "./metadata/pt-BR";
import svSeMetadata from "./metadata/sv-SE";
import deDeJoin from "./join-game/de-DE";
import enUsJoin from "./join-game/en-US";
import esEsJoin from "./join-game/es-ES";
import fiFiJoin from "./join-game/fi-FI";
import frFrJoin from "./join-game/fr-FR";
import itItJoin from "./join-game/it-IT";
import nlNlJoin from "./join-game/nl-NL";
import plPlJoin from "./join-game/pl-PL";
import jaJpJoin from "./join-game/ja-JP";
import zhHansJoin from "./join-game/zh-Hans";
import ptBrJoin from "./join-game/pt-BR";
import svSeJoin from "./join-game/sv-SE";

import enUsPlay from "./play/en-US";
import jaJpPlay from "./play/ja-JP";
import zhHansPlay from "./play/zh-Hans";

const metadataDictionaries = {
  "de-DE": deDeMetadata,
  "en-US": enUsMetadata,
  "es-ES": esEsMetadata,
  "fi-FI": fiFiMetadata,
  "fr-FR": frFrMetadata,
  "it-IT": itItMetadata,
  "nl-NL": nlNlMetadata,
  "pl-PL": plPlMetadata,
  "ja-JP": jaJpMetadata,
  "zh-Hans": zhHansMetadata,
  "pt-BR": ptBrMetadata,
  "sv-SE": svSeMetadata,
};

const landingServerDictionaries = {
  "de-DE": deDeLandingServer,
  "en-US": enUsLandingServer,
  "es-ES": esEsLandingServer,
  "fi-FI": fiFiLandingServer,
  "fr-FR": frFrLandingServer,
  "it-IT": itItLandingServer,
  "nl-NL": nlNlLandingServer,
  "pl-PL": plPlLandingServer,
  "ja-JP": jaJpLandingServer,
  "zh-Hans": zhHansLandingServer,
  "pt-BR": ptBrLandingServer,
  "sv-SE": svSeLandingServer,
};

const gameDictionaries = {
  "de-DE": deDeGame,
  "en-US": enUsGame,
  "es-ES": esEsGame,
  "fi-FI": fiFiGame,
  "fr-FR": frFrGame,
  "it-IT": itItGame,
  "nl-NL": nlNlGame,
  "pl-PL": plPlGame,
  "ja-JP": jaJpGame,
  "zh-Hans": zhHansGame,
  "pt-BR": ptBrGame,
  "sv-SE": svSeGame,
};

const joinDictionaries = {
  "de-DE": deDeJoin, "en-US": enUsJoin, "es-ES": esEsJoin,
  "fi-FI": fiFiJoin, "fr-FR": frFrJoin, "it-IT": itItJoin,
  "nl-NL": nlNlJoin, "pl-PL": plPlJoin,
  "ja-JP": jaJpJoin,
  "zh-Hans": zhHansJoin, "pt-BR": ptBrJoin,
  "sv-SE": svSeJoin,
};

function leafMap(value: unknown, path = ""): Record<string, string[]> {
  if (value === null || typeof value !== "object") {
    const placeholders =
      typeof value === "string"
        ? [...value.matchAll(/\{[^}]+\}/g)].map(([match]) => match).sort()
        : [];
    return { [path]: placeholders };
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      Object.entries(leafMap(child, path ? `${path}.${key}` : key)),
    ),
  );
}

describe("translation dictionaries", () => {
  it.each(Object.entries(metadataDictionaries))(
    "%s metadata preserves every leaf key and interpolation placeholder",
    (_locale, dictionary) => {
      expect(leafMap(dictionary)).toEqual(leafMap(enUsMetadata));
    },
  );

  it.each(Object.entries(landingServerDictionaries))(
    "%s landing server preserves every leaf key and interpolation placeholder",
    (_locale, dictionary) => {
      expect(leafMap(dictionary)).toEqual(leafMap(enUsLandingServer));
    },
  );

  it.each(Object.entries(gameDictionaries))(
    "%s game preserves every leaf key and interpolation placeholder",
    (_locale, dictionary) => {
      expect(leafMap(dictionary)).toEqual(leafMap(enUsGame));
    },
  );

  it.each(Object.entries(joinDictionaries))(
    "%s join directory preserves every leaf key and interpolation placeholder",
    (_locale, dictionary) => expect(leafMap(dictionary)).toEqual(leafMap(enUsJoin)),
  );

  it.each([["ja-JP", jaJpPlay], ["zh-Hans", zhHansPlay]])(
    "%s play preserves every leaf key and interpolation placeholder",
    (_locale, dictionary) => expect(leafMap(dictionary)).toEqual(leafMap(enUsPlay)),
  );

  it("keeps createGame in the game dictionary", () => {
    expect(Object.keys(enUsGame.errors)).toContain("createGame");
  });
});
