import "server-only";

import type { Locale } from "./index";
import type {
  GameDictionary,
  LandingServerDictionary,
  MetadataDictionary,
  JoinGameDictionary,
} from "./types";

const joinGameDictionaries: Record<Locale, () => Promise<JoinGameDictionary>> = {
  "en-US": () => import("./dictionaries/join-game/en-US").then((m) => m.default),
  "fi-FI": () => import("./dictionaries/join-game/fi-FI").then((m) => m.default),
  "es-ES": () => import("./dictionaries/join-game/es-ES").then((m) => m.default),
  "de-DE": () => import("./dictionaries/join-game/de-DE").then((m) => m.default),
  "sv-SE": () => import("./dictionaries/join-game/sv-SE").then((m) => m.default),
  "fr-FR": () => import("./dictionaries/join-game/fr-FR").then((m) => m.default),
  "pt-BR": () => import("./dictionaries/join-game/pt-BR").then((m) => m.default),
  "it-IT": () => import("./dictionaries/join-game/it-IT").then((m) => m.default),
  "nl-NL": () => import("./dictionaries/join-game/nl-NL").then((m) => m.default),
  "pl-PL": () => import("./dictionaries/join-game/pl-PL").then((m) => m.default),
};

const metadataDictionaries: Record<Locale, () => Promise<MetadataDictionary>> =
  {
    "en-US": () =>
      import("./dictionaries/metadata/en-US").then((module) => module.default),
    "fi-FI": () =>
      import("./dictionaries/metadata/fi-FI").then((module) => module.default),
    "es-ES": () =>
      import("./dictionaries/metadata/es-ES").then((module) => module.default),
    "de-DE": () =>
      import("./dictionaries/metadata/de-DE").then((module) => module.default),
    "sv-SE": () =>
      import("./dictionaries/metadata/sv-SE").then((module) => module.default),
    "fr-FR": () =>
      import("./dictionaries/metadata/fr-FR").then((module) => module.default),
    "pt-BR": () =>
      import("./dictionaries/metadata/pt-BR").then((module) => module.default),
    "it-IT": () =>
      import("./dictionaries/metadata/it-IT").then((module) => module.default),
    "nl-NL": () =>
      import("./dictionaries/metadata/nl-NL").then((module) => module.default),
    "pl-PL": () =>
      import("./dictionaries/metadata/pl-PL").then((module) => module.default),
  };

const landingServerDictionaries: Record<
  Locale,
  () => Promise<LandingServerDictionary>
> = {
  "en-US": () =>
    import("./dictionaries/landing-server/en-US").then(
      (module) => module.default,
    ),
  "fi-FI": () =>
    import("./dictionaries/landing-server/fi-FI").then(
      (module) => module.default,
    ),
  "es-ES": () =>
    import("./dictionaries/landing-server/es-ES").then(
      (module) => module.default,
    ),
  "de-DE": () =>
    import("./dictionaries/landing-server/de-DE").then(
      (module) => module.default,
    ),
  "sv-SE": () =>
    import("./dictionaries/landing-server/sv-SE").then(
      (module) => module.default,
    ),
  "fr-FR": () =>
    import("./dictionaries/landing-server/fr-FR").then(
      (module) => module.default,
    ),
  "pt-BR": () =>
    import("./dictionaries/landing-server/pt-BR").then(
      (module) => module.default,
    ),
  "it-IT": () =>
    import("./dictionaries/landing-server/it-IT").then(
      (module) => module.default,
    ),
  "nl-NL": () =>
    import("./dictionaries/landing-server/nl-NL").then(
      (module) => module.default,
    ),
  "pl-PL": () =>
    import("./dictionaries/landing-server/pl-PL").then(
      (module) => module.default,
    ),
};

const gameDictionaries: Record<Locale, () => Promise<GameDictionary>> = {
  "en-US": () =>
    import("./dictionaries/game/en-US").then((module) => module.default),
  "fi-FI": () =>
    import("./dictionaries/game/fi-FI").then((module) => module.default),
  "es-ES": () =>
    import("./dictionaries/game/es-ES").then((module) => module.default),
  "de-DE": () =>
    import("./dictionaries/game/de-DE").then((module) => module.default),
  "sv-SE": () =>
    import("./dictionaries/game/sv-SE").then((module) => module.default),
  "fr-FR": () =>
    import("./dictionaries/game/fr-FR").then((module) => module.default),
  "pt-BR": () =>
    import("./dictionaries/game/pt-BR").then((module) => module.default),
  "it-IT": () =>
    import("./dictionaries/game/it-IT").then((module) => module.default),
  "nl-NL": () =>
    import("./dictionaries/game/nl-NL").then((module) => module.default),
  "pl-PL": () =>
    import("./dictionaries/game/pl-PL").then((module) => module.default),
};

export async function getMetadataDictionary(
  locale: Locale,
): Promise<MetadataDictionary> {
  return metadataDictionaries[locale]();
}

export async function getLandingServerDictionary(
  locale: Locale,
): Promise<LandingServerDictionary> {
  return landingServerDictionaries[locale]();
}

export async function getGameDictionary(
  locale: Locale,
): Promise<GameDictionary> {
  return gameDictionaries[locale]();
}

export async function getJoinGameDictionary(locale: Locale): Promise<JoinGameDictionary> {
  return joinGameDictionaries[locale]();
}

const playDictionaries: Record<Locale, () => Promise<import("./types").PlayDictionary>> = {
  "en-US": () => import("./dictionaries/play/en-US").then(m => m.default),
  "fi-FI": () => import("./dictionaries/play/fi-FI").then(m => m.default),
  "es-ES": () => import("./dictionaries/play/es-ES").then(m => m.default),
  "de-DE": () => import("./dictionaries/play/de-DE").then(m => m.default),
  "sv-SE": () => import("./dictionaries/play/sv-SE").then(m => m.default),
  "fr-FR": () => import("./dictionaries/play/fr-FR").then(m => m.default),
  "pt-BR": () => import("./dictionaries/play/pt-BR").then(m => m.default),
  "it-IT": () => import("./dictionaries/play/it-IT").then(m => m.default),
  "nl-NL": () => import("./dictionaries/play/nl-NL").then(m => m.default),
  "pl-PL": () => import("./dictionaries/play/pl-PL").then(m => m.default),
};
export async function getPlayDictionary(locale: Locale) { return playDictionaries[locale](); }
