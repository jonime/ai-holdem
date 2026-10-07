import { DEFAULT_LOCALE } from "@/lib/i18n";

// English root routes have a fixed locale, independent of request-time params.
export function englishParams() {
  return Promise.resolve({ lang: DEFAULT_LOCALE });
}
