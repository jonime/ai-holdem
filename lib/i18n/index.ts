export const SUPPORTED_LOCALES = [
  "en-US",
  "fi-FI",
  "es-ES",
  "de-DE",
  "sv-SE",
  "fr-FR",
  "pt-BR",
  "it-IT",
  "nl-NL",
  "pl-PL",
  "ja-JP",
  "zh-Hans",
] as const;
export const DEFAULT_LOCALE = "en-US" as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function hasLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function addLocalePrefix(pathname: string, locale: Locale): string {
  const path = removeLocalePrefix(pathname.startsWith("/") ? pathname : `/${pathname}`);
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

export function removeLocalePrefix(pathname: string): string {
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`))
      return pathname.slice(locale.length + 1);
  }
  return pathname;
}
