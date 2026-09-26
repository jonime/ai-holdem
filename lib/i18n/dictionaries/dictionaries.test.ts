import { describe, expect, it } from "vitest";

import deDeGame from "./game/de-DE";
import enUsGame from "./game/en-US";
import esEsGame from "./game/es-ES";
import fiFiGame from "./game/fi-FI";
import frFrGame from "./game/fr-FR";
import itItGame from "./game/it-IT";
import nlNlGame from "./game/nl-NL";
import plPlGame from "./game/pl-PL";
import ptBrGame from "./game/pt-BR";
import svSeGame from "./game/sv-SE";
import deDeLandingClient from "./landing-client/de-DE";
import enUsLandingClient from "./landing-client/en-US";
import esEsLandingClient from "./landing-client/es-ES";
import fiFiLandingClient from "./landing-client/fi-FI";
import frFrLandingClient from "./landing-client/fr-FR";
import itItLandingClient from "./landing-client/it-IT";
import nlNlLandingClient from "./landing-client/nl-NL";
import plPlLandingClient from "./landing-client/pl-PL";
import ptBrLandingClient from "./landing-client/pt-BR";
import svSeLandingClient from "./landing-client/sv-SE";
import deDeLandingServer from "./landing-server/de-DE";
import enUsLandingServer from "./landing-server/en-US";
import esEsLandingServer from "./landing-server/es-ES";
import fiFiLandingServer from "./landing-server/fi-FI";
import frFrLandingServer from "./landing-server/fr-FR";
import itItLandingServer from "./landing-server/it-IT";
import nlNlLandingServer from "./landing-server/nl-NL";
import plPlLandingServer from "./landing-server/pl-PL";
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
import ptBrMetadata from "./metadata/pt-BR";
import svSeMetadata from "./metadata/sv-SE";

const metadataDictionaries = {
  "de-DE": deDeMetadata,
  "en-US": enUsMetadata,
  "es-ES": esEsMetadata,
  "fi-FI": fiFiMetadata,
  "fr-FR": frFrMetadata,
  "it-IT": itItMetadata,
  "nl-NL": nlNlMetadata,
  "pl-PL": plPlMetadata,
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
  "pt-BR": ptBrLandingServer,
  "sv-SE": svSeLandingServer,
};

const landingClientDictionaries = {
  "de-DE": deDeLandingClient,
  "en-US": enUsLandingClient,
  "es-ES": esEsLandingClient,
  "fi-FI": fiFiLandingClient,
  "fr-FR": frFrLandingClient,
  "it-IT": itItLandingClient,
  "nl-NL": nlNlLandingClient,
  "pl-PL": plPlLandingClient,
  "pt-BR": ptBrLandingClient,
  "sv-SE": svSeLandingClient,
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
  "pt-BR": ptBrGame,
  "sv-SE": svSeGame,
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

  it.each(Object.entries(landingClientDictionaries))(
    "%s landing client preserves every leaf key and interpolation placeholder",
    (_locale, dictionary) => {
      expect(leafMap(dictionary)).toEqual(leafMap(enUsLandingClient));
    },
  );

  it.each(Object.entries(gameDictionaries))(
    "%s game preserves every leaf key and interpolation placeholder",
    (_locale, dictionary) => {
      expect(leafMap(dictionary)).toEqual(leafMap(enUsGame));
    },
  );

  it.each(Object.entries(landingServerDictionaries))(
    "%s keeps linkable product names in the homepage copy",
    (_locale, dictionary) => {
      expect(dictionary.engineBody).toContain(dictionary.engineLinkLabel);
      expect(dictionary.privacyBody).toContain("TypeSafe System One");
      expect(dictionary.privacyBody).toContain("OpenRouter");
    },
  );

  it("keeps createGame in the game dictionary and createGameError in the landing client dictionary", () => {
    expect(Object.keys(enUsGame.errors)).toContain("createGame");
    expect(Object.keys(enUsLandingClient.newGame)).toContain(
      "createGameError",
    );
  });
});