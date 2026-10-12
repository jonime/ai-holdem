import type { MyGameSummary } from "@/lib/http/discovery-contracts";
import type { PlayDictionary } from "@/lib/i18n/types";
import type { Locale } from "@/lib/i18n";

export function personalTitle(game: MyGameSummary, d: PlayDictionary) {
  const otherHumans = game.humanCount - Number(game.viewerSeated);
  return game.title ?? (otherHumans === 0 && game.botCount > 0 ? d.tableWithBots : d.pokerTable);
}

export function composition(game: MyGameSummary, locale: Locale, d: PlayDictionary) {
  const groups: string[] = game.viewerSeated ? [d.you] : [];
  const humans = game.humanCount - Number(game.viewerSeated);
  const plurals = new Intl.PluralRules(locale);
  function add(count: number, messages: PlayDictionary["players"]) {
    if (count > 0) groups.push(messages[plurals.select(count)].replace("{count}", new Intl.NumberFormat(locale).format(count)));
  }
  add(humans, game.viewerSeated ? d.otherPlayers : d.players);
  add(game.botCount, d.bots);
  return groups.join(" · ");
}

export function exactUpdate(updatedAt: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit",
    minute: "2-digit", second: "2-digit", timeZone: "UTC", timeZoneName: "short",
  }).format(new Date(updatedAt));
}

export function relativeUpdate(updatedAt: string, now: number, locale: Locale, d: PlayDictionary) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(updatedAt)) / 1000));
  if (seconds < 60) return d.updatedJustNow;
  const units = [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]] as const;
  const [size, unit] = units.find(([size]) => seconds >= size)!;
  const time = new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-Math.floor(seconds / size), unit);
  return d.updated.replace("{time}", time);
}

/** Updates only on subscription (mount/new summaries) and visibility return. */
export function createActivityClock(summaries: readonly MyGameSummary[]) {
  // The store belongs to this summary snapshot, including an empty result.
  void summaries;
  let now: number | null = null;
  return {
    getSnapshot: () => now,
    getServerSnapshot: () => null,
    subscribe(listener: () => void) {
      function update() { now = Date.now(); listener(); }
      function visible() { if (document.visibilityState === "visible") update(); }
      update();
      document.addEventListener("visibilitychange", visible);
      return () => document.removeEventListener("visibilitychange", visible);
    },
  };
}
