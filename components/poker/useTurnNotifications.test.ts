/* eslint-disable react-hooks/rules-of-hooks -- Small hook driver exercises browser effects without a DOM renderer. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gameplayGame } from "@/test/fixtures/gameplay";
import type { Game } from "./types";
const h = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as (() => void | (() => void))[], deps: [] as unknown[][], cleanups: [] as (() => void)[] }));
vi.mock("react", () => ({
  useState(initial: unknown) { const i = h.index++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i], (v: unknown) => { h.slots[i] = v; }]; },
  useRef(initial: unknown) { const i = h.index++; if (!(i in h.slots)) h.slots[i] = { current: initial }; return h.slots[i]; },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) { const i = h.index++; if (!deps || !h.deps[i] || deps.some((v, n) => v !== h.deps[i][n])) { h.effects.push(effect); h.deps[i] = deps ?? []; } },
}));
vi.mock("./I18nProvider", () => ({ useI18n: () => ({ t: (key: string) => key === "turnNotification.title" ? "🟢 Your turn · AI Hold’em" : key }) }));
import { useTurnNotifications } from "./useTurnNotifications";
import { turnSoundStorageKey } from "./turn-audio";
let doc: EventTarget & { title: string; hidden: boolean };
let win: EventTarget & { localStorage: Storage };
let starts: ReturnType<typeof vi.fn>;
let close: ReturnType<typeof vi.fn>;
let blockedAudio: boolean;
const game: Game = { ...gameplayGame, poker: { ...gameplayGame.poker, currentActorId: "human" } };
function render(value: Game | null = game, blocked = false, online = true) {
  h.index = 0; h.effects = [];
  const result = useTurnNotifications(value, "owner", blocked, online);
  h.effects.forEach(effect => { const cleanup = effect(); if (cleanup) h.cleanups.push(cleanup); });
  vi.advanceTimersByTime(100);
  return result;
}
beforeEach(() => {
  vi.useFakeTimers(); h.slots = []; h.deps = []; h.cleanups = [];
  starts = vi.fn(); close = vi.fn(async () => {}); blockedAudio = false;
  doc = Object.assign(new EventTarget(), { title: "Route title", hidden: false });
  win = Object.assign(new EventTarget(), { localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() } as unknown as Storage });
  vi.stubGlobal("document", doc); vi.stubGlobal("window", win);
  vi.stubGlobal("AudioContext", class {
    state = "suspended"; currentTime = 0; destination = {}; close = close;
    async resume() { if (blockedAudio) throw Error(); this.state = "running"; }
    createOscillator() { return { frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: starts, stop: vi.fn() }; }
    createGain() { return { connect: vi.fn(), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }; }
  });
});
afterEach(() => { h.cleanups.forEach(fn => fn()); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("updates title on load, suppresses pending/offline, and guards navigation cleanup", () => {
  render(); expect(doc.title).toContain("Your turn"); expect(starts).not.toHaveBeenCalled();
  render(game, true); expect(doc.title).toBe("Route title");
  render(); expect(doc.title).toContain("Your turn");
  render(game, false, false); expect(doc.title).toBe("Route title");
  render(); doc.title = "Next page"; h.cleanups.forEach(fn => fn()); h.cleanups = [];
  expect(doc.title).toBe("Next page"); expect(vi.getTimerCount()).toBe(0);
});
it("previews once, sounds once on new turns, and never repeats after UI recovery", async () => {
  const toggle = render(); await toggle.toggle(); expect(starts).toHaveBeenCalledTimes(2);
  const next = { ...game, poker: { ...game.poker, handNumber: 2 } };
  render(next); expect(starts).toHaveBeenCalledTimes(4);
  render({ ...next, version: 100 }); render(next, true); render(next);
  expect(starts).toHaveBeenCalledTimes(4);
  doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange"));
  const third = { ...next, poker: { ...next.poker, handNumber: 3 } };
  doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange")); render(third);
  expect(starts).toHaveBeenCalledTimes(4);
  await render(third).toggle(); render(next); expect(starts).toHaveBeenCalledTimes(4);
  h.cleanups.forEach(fn => fn()); h.cleanups = []; expect(close).toHaveBeenCalledOnce();
});
it("stored preference requires a gesture and never catches up missed cues", async () => {
  vi.mocked(win.localStorage.getItem).mockReturnValue("true");
  render(); render({ ...game, poker: { ...game.poker, handNumber: 2 } });
  expect(starts).not.toHaveBeenCalled();
  win.dispatchEvent(new Event("pointerdown")); await Promise.resolve(); await Promise.resolve();
  expect(starts).not.toHaveBeenCalled();
  render({ ...game, poker: { ...game.poker, handNumber: 3 } }); expect(starts).toHaveBeenCalledTimes(2);
  vi.mocked(win.localStorage.getItem).mockReturnValue("false");
  win.dispatchEvent(Object.assign(new Event("storage"), { key: turnSoundStorageKey }));
  expect(render().enabled).toBe(false);
});
it("blocked audio and unavailable storage remain non-blocking", async () => {
  vi.mocked(win.localStorage.getItem).mockImplementation(() => { throw Error(); });
  vi.mocked(win.localStorage.setItem).mockImplementation(() => { throw Error(); });
  blockedAudio = true; await render().toggle();
  expect(render().notice).toBe("turnNotification.audioUnavailable");
  expect(doc.title).toContain("Your turn"); expect(starts).not.toHaveBeenCalled();
});
it("restores the title at timed expiry without a server refresh", async () => {
  const { observeTurnClock } = await import("./turn-clock");
  const timed = { ...game, serverTime: "2026-10-10T00:00:00Z", turnTimer: { decisionId: "d1", handNumber: 1, actorEngineId: "human", deadline: "2026-10-10T00:00:01Z" } };
  observeTurnClock(timed);
  render(timed); expect(doc.title).toContain("Your turn");
  vi.advanceTimersByTime(1100); expect(doc.title).toBe("Route title");
});
it("suppresses the returning refresh but permits a later new turn", async () => {
  await render().toggle();
  doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange"));
  doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange"));
  // The visibility event precedes the authoritative response by a network round trip.
  const returned = { ...game, version: 3, poker: { ...game.poker, handNumber: 2 } };
  render(returned); expect(starts).toHaveBeenCalledTimes(2);
  expect(doc.title).toContain("Your turn");
  render({ ...returned, version: 4, poker: { ...returned.poker, handNumber: 3 } });
  expect(starts).toHaveBeenCalledTimes(4);
});
