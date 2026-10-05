import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "./index";

/** Match browser preferences in quality order, with regional language fallback. */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  const preferences = (acceptLanguage ?? "")
    .split(",")
    .flatMap((entry) => {
      const match = /^\s*([a-z]{1,8}(?:-[a-z0-9]{1,8})*)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/i.exec(entry);
      if (!match) return [];
      const quality = match[2] === undefined ? 1 : Number(match[2]);
      return quality > 0 ? [{ language: match[1].toLowerCase(), quality }] : [];
    })
    .sort((left, right) => right.quality - left.quality);

  for (const { language } of preferences) {
    const exact = SUPPORTED_LOCALES.find(
      (locale) => locale.toLowerCase() === language,
    );
    if (exact) return exact;
    const baseLanguage = language.split("-")[0];
    const regional = SUPPORTED_LOCALES.find(
      (locale) => locale.split("-")[0] === baseLanguage,
    );
    if (regional) return regional;
  }

  return DEFAULT_LOCALE;
}
