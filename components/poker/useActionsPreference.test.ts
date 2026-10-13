/* eslint-disable react-hooks/rules-of-hooks -- Browser-effect hook driver. */
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as (() => void | (() => void))[], deps: [] as unknown[][], cleanups: [] as (() => void)[] }));
vi.mock("react", () => ({
  useState(initial: unknown) { const i = h.index++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i], (v: unknown) => { h.slots[i] = v; }]; },
  useRef(initial: unknown) { const i = h.index++; if (!(i in h.slots)) h.slots[i] = { current: initial }; return h.slots[i]; },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) { const i = h.index++; if (!deps || !h.deps[i] || deps.some((v, n) => v !== h.deps[i][n])) { h.effects.push(effect); h.deps[i] = deps ?? []; } },
}));
import { useActionsPreference } from "./useActionsPreference";
let win: EventTarget & { localStorage: Storage };
function render(flush = true) {
  h.index = 0; h.effects = [];
  const result = useActionsPreference();
  if (flush) h.effects.forEach(effect => effect());
  return result;
}
beforeEach(() => {
  h.slots = []; h.deps = []; h.cleanups = [];
  win = Object.assign(new EventTarget(), { localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() } as unknown as Storage, matchMedia: vi.fn(() => ({ matches: false })) });
  vi.stubGlobal("window", win);
});
afterEach(() => vi.unstubAllGlobals());
it.each([null, "invalid", "false", "true"])("loads %s only after the hydration default", saved => {
  vi.mocked(win.localStorage.getItem).mockReturnValue(saved);
  expect(render().collapsed).toBe(false);
  expect(render().collapsed).toBe(saved === "true");
});
it("keeps mobile initially collapsed even with a saved open panel", () => {
  vi.stubGlobal("window", { ...win, localStorage: win.localStorage, matchMedia: () => ({ matches: true }) });
  vi.mocked(win.localStorage.getItem).mockReturnValue("false");
  expect(render().collapsed).toBe(false); expect(render().collapsed).toBe(true);
});
it.each(["access", "read", "write"])("allows changes when storage %s throws", failure => {
  if (failure === "access") Object.defineProperty(win, "localStorage", { get() { throw Error(); } });
  if (failure === "read") vi.mocked(win.localStorage.getItem).mockImplementation(() => { throw Error(); });
  if (failure === "write") vi.mocked(win.localStorage.setItem).mockImplementation(() => { throw Error(); });
  const value = render(); value.toggle(); expect(render().collapsed).toBe(true);
  value.toggle(); expect(render().collapsed).toBe(false);
  value.change(true); expect(render().collapsed).toBe(true);
});
it("initialization cannot replace a user interaction", () => {
  const value = render(false); const effects = [...h.effects];
  value.change(true); effects.forEach(effect => effect());
  expect(render().collapsed).toBe(true);
});
it("persists boolean encoding without subscribing or responding to resize", () => {
  render().change(true); expect(win.localStorage.setItem).toHaveBeenCalledWith("ai-holdem-feed-collapsed", "true");
  win.dispatchEvent(new Event("resize")); expect(render().collapsed).toBe(true);
});
