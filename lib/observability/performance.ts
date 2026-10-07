import { hasLocale, removeLocalePrefix } from "@/lib/i18n";

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
    const firstSegment = url.pathname.split("/")[1];
    const localized = hasLocale(firstSegment);
    const pathname = localized ? removeLocalePrefix(url.pathname) : url.pathname;
    const match = /^\/(?:about|developers|play|join-game|game\/[^/]+)?\/?$/.exec(pathname);
    if (!match) return null;

    const suffix = pathname.startsWith("/game/") ? "/game/[gameId]" : pathname.replace(/\/$/, "");
    const prefix = localized ? `/${firstSegment}` : "";
    return {
      type: event.type,
      url: `${url.origin}${prefix}${suffix || (localized ? "" : "/")}`,
      route: localized ? `/[lang]${suffix}` : suffix || "/",
    };
  } catch {
    return null;
  }
}
