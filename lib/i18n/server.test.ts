import { describe, expect, it } from "vitest";

import deDeGame from "./dictionaries/game/de-DE";
import enUsGame from "./dictionaries/game/en-US";
import esEsGame from "./dictionaries/game/es-ES";
import fiFiGame from "./dictionaries/game/fi-FI";
import frFrGame from "./dictionaries/game/fr-FR";
import itItGame from "./dictionaries/game/it-IT";
import nlNlGame from "./dictionaries/game/nl-NL";
import plPlGame from "./dictionaries/game/pl-PL";
import ptBrGame from "./dictionaries/game/pt-BR";
import svSeGame from "./dictionaries/game/sv-SE";
import deDeLandingClient from "./dictionaries/landing-client/de-DE";
import enUsLandingClient from "./dictionaries/landing-client/en-US";
import esEsLandingClient from "./dictionaries/landing-client/es-ES";
import fiFiLandingClient from "./dictionaries/landing-client/fi-FI";
import frFrLandingClient from "./dictionaries/landing-client/fr-FR";
import itItLandingClient from "./dictionaries/landing-client/it-IT";
import nlNlLandingClient from "./dictionaries/landing-client/nl-NL";
import plPlLandingClient from "./dictionaries/landing-client/pl-PL";
import ptBrLandingClient from "./dictionaries/landing-client/pt-BR";
import svSeLandingClient from "./dictionaries/landing-client/sv-SE";
import deDeLandingServer from "./dictionaries/landing-server/de-DE";
import enUsLandingServer from "./dictionaries/landing-server/en-US";
import esEsLandingServer from "./dictionaries/landing-server/es-ES";
import fiFiLandingServer from "./dictionaries/landing-server/fi-FI";
import frFrLandingServer from "./dictionaries/landing-server/fr-FR";
import itItLandingServer from "./dictionaries/landing-server/it-IT";
import nlNlLandingServer from "./dictionaries/landing-server/nl-NL";
import plPlLandingServer from "./dictionaries/landing-server/pl-PL";
import ptBrLandingServer from "./dictionaries/landing-server/pt-BR";
import svSeLandingServer from "./dictionaries/landing-server/sv-SE";
import deDeMetadata from "./dictionaries/metadata/de-DE";
import enUsMetadata from "./dictionaries/metadata/en-US";
import esEsMetadata from "./dictionaries/metadata/es-ES";
import fiFiMetadata from "./dictionaries/metadata/fi-FI";
import frFrMetadata from "./dictionaries/metadata/fr-FR";
import itItMetadata from "./dictionaries/metadata/it-IT";
import nlNlMetadata from "./dictionaries/metadata/nl-NL";
import plPlMetadata from "./dictionaries/metadata/pl-PL";
import ptBrMetadata from "./dictionaries/metadata/pt-BR";
import svSeMetadata from "./dictionaries/metadata/sv-SE";
import { SUPPORTED_LOCALES, type Locale } from "./index";
import type {
  GameDictionary,
  LandingClientDictionary,
  LandingServerDictionary,
  MetadataDictionary,
} from "./types";
import {
  getGameDictionary,
  getLandingClientDictionary,
  getLandingServerDictionary,
  getMetadataDictionary,
} from "./server";

const metadataDictionaries: Record<Locale, MetadataDictionary> = {
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

const landingServerDictionaries: Record<
  Locale,
  LandingServerDictionary
> = {
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

const landingClientDictionaries: Record<
  Locale,
  LandingClientDictionary
> = {
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

const gameDictionaries: Record<Locale, GameDictionary> = {
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

describe("dictionary loaders", () => {
  it.each(SUPPORTED_LOCALES)(
    "resolves the %s metadata dictionary",
    async (locale) => {
      await expect(getMetadataDictionary(locale)).resolves.toEqual(
        metadataDictionaries[locale],
      );
    },
  );

  it.each(SUPPORTED_LOCALES)(
    "resolves the %s landing server dictionary",
    async (locale) => {
      await expect(getLandingServerDictionary(locale)).resolves.toEqual(
        landingServerDictionaries[locale],
      );
    },
  );

  it.each(SUPPORTED_LOCALES)(
    "resolves the %s landing client dictionary",
    async (locale) => {
      await expect(getLandingClientDictionary(locale)).resolves.toEqual(
        landingClientDictionaries[locale],
      );
    },
  );

  it.each(SUPPORTED_LOCALES)(
    "resolves the %s game dictionary",
    async (locale) => {
      await expect(getGameDictionary(locale)).resolves.toEqual(
        gameDictionaries[locale],
      );
    },
  );
});
