import { hasLocale } from "@/lib/i18n";

type PerformanceEvent = {
  type: "vital";
  url: string;
  route?: string;
};

// Only report known page shapes. Table URLs grant viewing access, so replace
// their IDs and discard query strings/fragments before sending telemetry.
export function redactPerformanceEvent(event: PerformanceEvent): PerformanceEvent | null {
  try {
    const url = new URL(event.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const match = /^\/([^/]+)(?:\/(about|developers|join-game)|\/game\/[^/]+)?\/?$/.exec(url.pathname);
    if (!match) return null;

    const [, locale, page] = match;
    if (!hasLocale(locale)) return null;
    const suffix = url.pathname.includes("/game/") ? "/game/[gameId]" : page ? `/${page}` : "";
    return {
      type: event.type,
      url: `${url.origin}/${locale}${suffix}`,
      route: `/[lang]${suffix}`,
    };
  } catch {
    return null;
  }
}
