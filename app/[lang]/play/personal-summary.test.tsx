import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { getPlayDictionary } from "@/lib/i18n/server";
import type { MyGameSummary } from "@/lib/http/discovery-contracts";
import { MyTables } from "./MyTables";
import { composition, createActivityClock, exactUpdate, personalTitle, relativeUpdate } from "./personal-summary";
const game: MyGameSummary = { gameId: "11111111-1111-4111-8111-111111111111", version: 0, removal: "delete", title: null, status: "playing", updatedAt: "2026-10-06T12:00:00Z", occupiedSeats: 6, totalSeats: 6, humanCount: 3, botCount: 3, viewerSeated: true };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("describes seated callers, unseated hosts, singular groups and zero groups", async () => {
  const d = await getPlayDictionary("en-US");
  expect(composition(game, "en-US", d)).toBe("You · 2 other players · 3 bots");
  expect(composition({ ...game, viewerSeated: false, botCount: 2 }, "en-US", d)).toBe("3 players · 2 bots");
  expect(composition({ ...game, humanCount: 2, botCount: 1 }, "en-US", d)).toBe("You · 1 other player · 1 bot");
  expect(composition({ ...game, humanCount: 1, botCount: 0 }, "en-US", d)).toBe("You");
  expect(composition({ ...game, humanCount: 0, botCount: 2, viewerSeated: false }, "en-US", d)).toBe("2 bots");
  expect(composition(game, "fi-FI", await getPlayDictionary("fi-FI"))).toBe("Sinä · 2 muuta pelaajaa · 3 bottia");
});
it("preserves titles and labels bots only when every other occupied seat is a bot", async () => {
  const d = await getPlayDictionary("en-US");
  expect(personalTitle(game, d)).toBe("Poker table");
  expect(personalTitle({ ...game, humanCount: 1 }, d)).toBe("Table with bots");
  expect(personalTitle({ ...game, humanCount: 0, viewerSeated: false }, d)).toBe("Table with bots");
  expect(personalTitle({ ...game, humanCount: 1, botCount: 0 }, d)).toBe("Poker table");
  expect(personalTitle({ ...game, title: "Friday friends" }, d)).toBe("Friday friends");
});
it.each([[ -60, "Updated just now" ], [0, "Updated just now"], [59, "Updated just now"], [60, "Updated 1 minute ago"], [1200, "Updated 20 minutes ago"], [3600, "Updated 1 hour ago"], [86400, "Updated 1 day ago"], [604800, "Updated 1 week ago"], [2592000, "Updated 1 month ago"], [31536000, "Updated 1 year ago"]])("formats relative boundary %s", async (elapsed, expected) => {
  expect(relativeUpdate(game.updatedAt, Date.parse(game.updatedAt) + elapsed * 1000, "en-US", await getPlayDictionary("en-US"))).toBe(expected);
});
it("renders a stable absolute UTC time for SSR and hydration with an exact label and tooltip", async () => {
  const d = await getPlayDictionary("en-US");
  const props = { locale: "en-US" as const, dictionary: d, initialGames: [game], initialError: false };
  vi.useFakeTimers(); vi.setSystemTime(new Date("2030-01-01"));
  const first = renderToString(<MyTables {...props} />);
  vi.setSystemTime(new Date("2040-01-01"));
  expect(renderToString(<MyTables {...props} />)).toBe(first);
  const exact = d.updated.replace("{time}", exactUpdate(game.updatedAt, "en-US"));
  expect(first).toContain(`dateTime="${game.updatedAt}"`);
  expect(first).toContain(`title="${exact}" aria-label="${exact}">${exact}</time>`);
  expect(first).not.toContain("ago");
});
it("recomputes on mount and visibility return, without a repeating timer, and cleans up", () => {
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", doc); vi.useFakeTimers(); vi.setSystemTime(1000);
  const clock = createActivityClock([game]); const listener = vi.fn();
  expect(clock.getServerSnapshot()).toBeNull(); expect(clock.getSnapshot()).toBeNull();
  const cleanup = clock.subscribe(listener); expect(clock.getSnapshot()).toBe(1000);
  vi.setSystemTime(2000); doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange"));
  expect(clock.getSnapshot()).toBe(1000);
  doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange")); expect(clock.getSnapshot()).toBe(2000);
  expect(vi.getTimerCount()).toBe(0); cleanup(); doc.dispatchEvent(new Event("visibilitychange")); expect(listener).toHaveBeenCalledTimes(2);
  expect(createActivityClock([{ ...game, updatedAt: "2026-10-07T00:00:00Z" }]).getSnapshot()).toBeNull();
});
