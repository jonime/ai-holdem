import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import type {
  GameDictionary,
  MetadataDictionary,
  LandingServerDictionary,
  JoinGameDictionary,
  PlayDictionary,
} from "@/lib/i18n/types";

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
import deDePlay from "./play/de-DE";
import esEsPlay from "./play/es-ES";
import fiFiPlay from "./play/fi-FI";
import frFrPlay from "./play/fr-FR";
import itItPlay from "./play/it-IT";
import nlNlPlay from "./play/nl-NL";
import plPlPlay from "./play/pl-PL";
import ptBrPlay from "./play/pt-BR";
import svSePlay from "./play/sv-SE";

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
} satisfies Record<Locale, MetadataDictionary>;

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
} satisfies Record<Locale, LandingServerDictionary>;

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
} satisfies Record<Locale, GameDictionary>;

const joinDictionaries = {
  "de-DE": deDeJoin, "en-US": enUsJoin, "es-ES": esEsJoin,
  "fi-FI": fiFiJoin, "fr-FR": frFrJoin, "it-IT": itItJoin,
  "nl-NL": nlNlJoin, "pl-PL": plPlJoin,
  "ja-JP": jaJpJoin,
  "zh-Hans": zhHansJoin, "pt-BR": ptBrJoin,
  "sv-SE": svSeJoin,
} satisfies Record<Locale, JoinGameDictionary>;

const playDictionaries = {
  "en-US": enUsPlay,
  "de-DE": deDePlay,
  "es-ES": esEsPlay,
  "fi-FI": fiFiPlay,
  "fr-FR": frFrPlay,
  "it-IT": itItPlay,
  "nl-NL": nlNlPlay,
  "pl-PL": plPlPlay,
  "pt-BR": ptBrPlay,
  "sv-SE": svSePlay,
  "ja-JP": jaJpPlay,
  "zh-Hans": zhHansPlay,
} satisfies Record<Locale, PlayDictionary>;

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
  it.each([
    ["metadata", metadataDictionaries], ["landing server", landingServerDictionaries],
    ["game", gameDictionaries], ["join", joinDictionaries], ["play", playDictionaries],
  ])("%s registry covers every supported locale", (_group, dictionaries) => {
    expect(Object.keys(dictionaries).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it("detects missing leaf keys", () => {
    expect(leafMap({ table: {} })).not.toEqual(leafMap({ table: { hand: "Hand {hand}" } }));
  });

  it.each(["Hand {number}", "Hand"])("detects renamed or missing placeholders: %s", hand => {
    expect(leafMap({ hand })).not.toEqual(leafMap({ hand: "Hand {hand}" }));
  });

  it("compares sorted placeholders while retaining duplicate occurrences", () => {
    expect(leafMap({ label: "{a} {b} {a}" })).toEqual(leafMap({ label: "{b} {a} {a}" }));
    expect(leafMap({ label: "{a} {b}" })).not.toEqual(leafMap({ label: "{a} {b} {a}" }));
  });
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

  it.each(Object.entries(playDictionaries))(
    "%s play preserves every leaf key and interpolation placeholder",
    (_locale, dictionary) => expect(leafMap(dictionary)).toEqual(leafMap(enUsPlay)),
  );

  it("keeps createGame in the game dictionary", () => {
    expect(Object.keys(enUsGame.errors)).toContain("createGame");
  });
});
