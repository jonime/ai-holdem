/* eslint-disable react-hooks/rules-of-hooks -- Deterministic hook effect driver. */
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { observeTurnClock } from "./turn-clock";
import { gameplayGame } from "@/test/fixtures/gameplay";
import type { Game } from "./types";
const h = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as (() => void | (() => void))[], deps: [] as unknown[][], cleanups: [] as (() => void)[] }));
vi.mock("react", () => ({
  useRef(initial: unknown) { const i = h.index++; if (!(i in h.slots)) h.slots[i] = { current: initial }; return h.slots[i]; },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) { const i = h.index++; if (!deps || !h.deps[i] || deps.some((v, n) => v !== h.deps[i][n])) { h.effects.push(effect); h.deps[i] = deps ?? []; } },
}));
vi.mock("./I18nProvider", () => ({ useI18n: () => ({ locale: "en-US", t: (key: string) => key }) }));
import { useHandAnnouncements } from "./useHandAnnouncements";
let doc: EventTarget & { hidden: boolean; body: object; createElement: ReturnType<typeof vi.fn>; querySelectorAll: ReturnType<typeof vi.fn> };
let win: EventTarget;
let region: { textContent: string; className: string; setAttribute: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
let bodyAppend: ReturnType<typeof vi.fn>, dialogAppend: ReturnType<typeof vi.fn>;
let move: () => void;
let writes: string[];
const game: Game = { ...gameplayGame, poker: { ...gameplayGame.poker, currentActorId: "human" } };
function render(value: Game | null = game, revision = 1, blocked = false, online = true, advance = true) {
  h.index = 0; h.effects = [];
  useHandAnnouncements("game-1", value, "owner", revision, blocked, online);
  h.effects.forEach(effect => { const cleanup = effect(); if (cleanup) h.cleanups.push(cleanup); });
  if (advance) vi.advanceTimersByTime(100);
}
beforeEach(() => {
  vi.useFakeTimers(); h.slots = []; h.deps = []; h.cleanups = []; writes = [];
  let text = "";
  region = { get textContent() { return text; }, set textContent(value: string) { text = value; writes.push(value); },
    className: "", setAttribute: vi.fn(), remove: vi.fn() };
  bodyAppend = vi.fn(); dialogAppend = vi.fn();
  doc = Object.assign(new EventTarget(), { hidden: false, body: { appendChild: bodyAppend }, createElement: vi.fn(() => region), querySelectorAll: vi.fn(() => []) });
  win = new EventTarget();
  vi.stubGlobal("document", doc); vi.stubGlobal("window", win); vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("MutationObserver", class { constructor(callback: () => void) { move = callback; } observe() {} disconnect() {} });
});
afterEach(() => { h.cleanups.forEach(fn => fn()); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("loads once, keeps a single region inside active dialogs, and never repeats on overlay changes", () => {
  render(); expect(region.textContent).toBe("accessibility.turn");
  const count = writes.filter(Boolean).length;
  render({ ...game, version: 99 }, 2);
  expect(writes.filter(Boolean)).toHaveLength(count);
  doc.querySelectorAll.mockReturnValue([{ appendChild: dialogAppend }]); move();
  expect(dialogAppend).toHaveBeenCalledWith(region); expect(region.textContent).toBe("");
  render(game, 3); expect(writes.filter(Boolean)).toHaveLength(count);
  doc.querySelectorAll.mockReturnValue([]); move(); render(game, 4);
  expect(bodyAppend).toHaveBeenCalledTimes(2); expect(writes.filter(Boolean)).toHaveLength(count);
});
it("returning from a hidden tab waits for a post-return response, even after hidden updates", () => {
  render(null, 0);
  doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange"));
  render(game, 2, false, true, false); // hidden response arrives while timers are throttled
  doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange"));
  expect(region.textContent).toBe("");
  render(game, 2); expect(region.textContent).toBe("");
  render(game, 3); expect(region.textContent).toBe("accessibility.turn");
});
it("blocks recovery and offline snapshots, waits for authoritative refresh and clears teardown", () => {
  render(game, 1, true); render(game, 1); expect(region.textContent).toBe("");
  render(game, 2); expect(region.textContent).toBe("accessibility.turn");
  render(game, 2, false, false); expect(region.textContent).toBe("");
  win.dispatchEvent(new Event("online")); render(game, 3);
  expect(region.textContent).toBe(""); // same already-consumed decision
  h.cleanups.forEach(fn => fn()); h.cleanups = [];
  expect(region.remove).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});

it("clears an expired decision without per-second live updates", () => {
  const timed = { ...game, serverTime: "2026-10-20T00:00:00Z", turnTimer: {
    decisionId: "decision", handNumber: 1, actorEngineId: "human", deadline: "2026-10-20T00:00:01Z",
  } };
  observeTurnClock(timed);
  render(timed);
  expect(region.textContent).toBe("accessibility.turn");
  const updates = writes.length;
  vi.advanceTimersByTime(500); expect(writes).toHaveLength(updates);
  vi.advanceTimersByTime(500); expect(region.textContent).toBe("");
  expect(writes.filter(Boolean)).toHaveLength(1);
});
