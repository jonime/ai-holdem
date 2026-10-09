import { SUPPORTED_LOCALES, type Locale } from "./index";

export const LANGUAGE_NAMES: Record<Locale, string> = {
  "en-US": "English",
  "fi-FI": "Suomi",
  "es-ES": "Español",
  "de-DE": "Deutsch",
  "sv-SE": "Svenska",
  "fr-FR": "Français",
  "pt-BR": "Português (Brasil)",
  "it-IT": "Italiano",
  "nl-NL": "Nederlands",
  "pl-PL": "Polski",
  "ja-JP": "日本語",
  "zh-Hans": "简体中文",
};

export const LANGUAGE_LABELS: Record<Locale, string> = {
  "en-US": "Language",
  "fi-FI": "Kieli",
  "es-ES": "Idioma",
  "de-DE": "Sprache",
  "sv-SE": "Språk",
  "fr-FR": "Langue",
  "pt-BR": "Idioma",
  "it-IT": "Lingua",
  "nl-NL": "Taal",
  "pl-PL": "Język",
  "ja-JP": "言語",
  "zh-Hans": "语言",
};

export const SORTED_LOCALES = [...SUPPORTED_LOCALES].sort((left, right) =>
  LANGUAGE_NAMES[left].localeCompare(LANGUAGE_NAMES[right]),
);
