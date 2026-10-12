/* eslint-disable react-hooks/rules-of-hooks -- Browser-effect hook driver. */
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as (() => void | (() => void))[], deps: [] as unknown[][], cleanups: [] as (() => void)[] }));
vi.mock("react", () => ({
  useState(initial: unknown) { const i = h.index++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i], (v: unknown) => { h.slots[i] = v; }]; },
  useRef(initial: unknown) { const i = h.index++; if (!(i in h.slots)) h.slots[i] = { current: initial }; return h.slots[i]; },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) { const i = h.index++; if (!deps || !h.deps[i] || deps.some((v, n) => v !== h.deps[i][n])) { h.effects.push(effect); h.deps[i] = deps ?? []; } },
}));
import { useSettings } from "./useSettings";
import { defaultSettings, settingsStorageKey } from "./settings";
let win: EventTarget & { localStorage: Storage };
function render() {
  h.index = 0; h.effects = [];
  const result = useSettings();
  h.effects.forEach(effect => { const cleanup = effect(); if (cleanup) h.cleanups.push(cleanup); });
  return result;
}
beforeEach(() => {
  h.slots = []; h.deps = []; h.cleanups = [];
  win = Object.assign(new EventTarget(), { localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() } as unknown as Storage });
  vi.stubGlobal("window", win);
});
afterEach(() => { h.cleanups.forEach(fn => fn()); vi.unstubAllGlobals(); });
it("uses hydration defaults until saved preferences have been read", () => {
  vi.mocked(win.localStorage.getItem).mockReturnValue(JSON.stringify({ version: 1, turnSound: true, gameplayShortcuts: false }));
  expect(render()).toMatchObject({ ready: false, preferences: defaultSettings });
  expect(render()).toMatchObject({ ready: true, preferences: { turnSound: true, gameplayShortcuts: false } });
});
it("updates immediately, combines successive patches and tolerates failed persistence", () => {
  vi.mocked(win.localStorage.setItem).mockImplementation(() => { throw Error(); });
  const value = render(); value.update({ turnSound: true }); value.update({ gameplayShortcuts: false });
  expect(render().preferences).toEqual({ version: 1, turnSound: true, gameplayShortcuts: false });
});
it("synchronizes storage events, ignores legacy keys, resets on removal and cleans up", () => {
  render();
  const event = (key: string | null, newValue: string | null) => win.dispatchEvent(Object.assign(new Event("storage"), { key, newValue }));
  event("ai-holdem-turn-sound", "true"); expect(render().preferences).toEqual(defaultSettings);
  event(settingsStorageKey, '{"version":1,"turnSound":true,"gameplayShortcuts":false}');
  expect(render().preferences.turnSound).toBe(true);
  event(settingsStorageKey, null); expect(render().preferences).toEqual(defaultSettings);
  event(settingsStorageKey, "malformed"); expect(render().preferences).toEqual(defaultSettings);
  event(settingsStorageKey, '{"version":1,"turnSound":true,"gameplayShortcuts":false}');
  event(null, null); expect(render().preferences).toEqual(defaultSettings);
  h.cleanups.forEach(fn => fn()); h.cleanups = [];
  event(settingsStorageKey, '{"version":1,"turnSound":true,"gameplayShortcuts":false}');
  expect(render().preferences).toEqual(defaultSettings);
});
it("inaccessible storage still finishes initialization", () => {
  vi.mocked(win.localStorage.getItem).mockImplementation(() => { throw Error(); });
  render(); expect(render()).toMatchObject({ ready: true, preferences: defaultSettings });
});
