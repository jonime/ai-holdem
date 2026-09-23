export const SUPPORTED_LOCALES = ["en-US", "fi-FI"] as const;
export const DEFAULT_LOCALE = "en-US" as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function hasLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function addLocalePrefix(pathname: string, locale: Locale): string {
  if (pathname === "/") return `/${locale}`;
  return pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
    ? pathname
    : `/${locale}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export function removeLocalePrefix(pathname: string): string {
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`))
      return pathname.slice(locale.length + 1);
  }
  return pathname;
}
