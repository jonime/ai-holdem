import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { ReplayData } from "@/lib/http/share-contracts";
const h = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, deps: [] as unknown[][],
  effects: new Map<number, () => void | (() => void)>(), cleanups: new Map<number, () => void>() }));
vi.mock("react", () => {
  function effect(fn: () => void | (() => void), deps: unknown[]) {
    const i = h.index++;
    if (!h.deps[i] || deps.some((d, n) => d !== h.deps[i][n])) {
      h.deps[i] = deps; h.effects.set(i, fn);
    }
  }
  return {
    memo: (fn: unknown) => fn,
    useState(value: unknown) {
      const i = h.index++;
      if (!(i in h.slots)) h.slots[i] = value;
      return [h.slots[i], (next: unknown) => { h.slots[i] = typeof next === "function" ? next(h.slots[i]) : next; }];
    },
    useRef(value: unknown) { const i = h.index++; if (!(i in h.slots)) h.slots[i] = { current: value }; return h.slots[i]; },
    useCallback(fn: unknown, deps: unknown[]) {
      const i = h.index++;
      if (!h.deps[i] || deps.some((d, n) => d !== h.deps[i][n])) { h.deps[i] = deps; h.slots[i] = fn; }
      return h.slots[i];
    },
    useEffect: effect, useLayoutEffect: effect,
  };
});
vi.mock("./I18nProvider", () => ({ useI18n: () => ({ t: (s: string) => s, dictionary: { feed: {}, cards: {} } }) }));
vi.mock("./AmountDisplay", () => ({ useAmounts: () => ({ format: String, spoken: String, mode: "chips" }), AmountText: () => null }));
vi.mock("./view-model", () => ({ cardLabel: String }));
import { ReplayViewer } from "./ReplayViewer";
const frame = (kind: "start" | "action" | "street" | "result", board: string[], street: "preflop" | "flop" | "turn" | "river" | "complete") => ({ kind, board, street, pot: 30, players: [], action: null, nextActorSeat: null });
const replay: ReplayData = { dealerSeat: 0, smallBlindSeat: 0, bigBlindSeat: 1, participants: [], pots: [], frames: [
  frame("start", [], "preflop"), frame("action", [], "preflop"),
  frame("street", ["Ac", "Kd", "2h"], "flop"), frame("action", ["Ac", "Kd", "2h"], "flop"),
  frame("street", ["Ac", "Kd", "2h", "3s"], "turn"), frame("street", ["Ac", "Kd", "2h", "3s", "4c"], "river"),
  frame("result", ["Ac", "Kd", "2h", "3s", "4c"], "complete"),
] };
type Element = ReactElement<{ children?: unknown; onClick?: () => void; [key: string]: unknown }>;
let currentReplay = replay;
let tree: Element, doc: EventTarget & { hidden: boolean; body: object; querySelectorAll: () => unknown[]; querySelector: () => null };
let win: EventTarget, overlay: boolean, observe: () => void;
const root = { closest: () => null, contains: () => true, focus: vi.fn() };
function nodes(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Element;
  return [el, ...nodes(el.props.children)];
}
function render(value = currentReplay, active = true) {
  currentReplay = value;
  h.index = 0; tree = ReplayViewer({ replay: value, active });
  (h.slots[0] as { current: unknown }).current = root;
  for (const [i, effect] of h.effects) { h.cleanups.get(i)?.(); const cleanup = effect(); if (cleanup) h.cleanups.set(i, cleanup); else h.cleanups.delete(i); }
  h.effects.clear();
}
function click(label: string) { const button = nodes(tree).find(n => n.props.children === `replay.${label}` && n.props.onClick); expect(button).toBeDefined(); button!.props.onClick!(); render(); }
function index() { return nodes(tree).find(n => "data-replay-frame" in n.props)!.props["data-replay-frame"]; }
function tick(ms: number) { vi.advanceTimersByTime(ms); render(); }
beforeEach(() => {
  currentReplay = replay;
  vi.useFakeTimers(); h.slots = []; h.deps = []; h.effects.clear(); h.cleanups.clear(); overlay = false;
  doc = Object.assign(new EventTarget(), { hidden: false, body: {}, querySelectorAll: () => overlay ? [{ contains: () => false }] : [], querySelector: () => null });
  vi.stubGlobal("HTMLElement", class {});
  win = new EventTarget(); vi.stubGlobal("document", doc); vi.stubGlobal("window", win);
  vi.stubGlobal("MutationObserver", class { constructor(fn: () => void) { observe = fn; } observe() {} disconnect() {} });
  render();
});
afterEach(() => { h.cleanups.forEach(fn => fn()); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("starts paused, uses initial/action/community delays, stops at Result and replays", () => {
  tick(9000); expect(index()).toBe(0); expect(vi.getTimerCount()).toBe(0);
  click("play"); tick(1999); expect(index()).toBe(0); tick(1); expect(index()).toBe(1);
  tick(1199); expect(index()).toBe(1); tick(1); expect(index()).toBe(2);
  tick(1999); expect(index()).toBe(2); tick(1); expect(index()).toBe(3);
  tick(1200); expect(index()).toBe(4); tick(2000); expect(index()).toBe(5); tick(2000); expect(index()).toBe(6);
  expect(vi.getTimerCount()).toBe(0); click("replay"); expect(index()).toBe(0); tick(2000); expect(index()).toBe(1);
});
it("pause/resume starts a fresh delay; rapid clicks leave only one timer", () => {
  click("play"); tick(1500); click("pause"); tick(3000); expect(index()).toBe(0);
  click("play"); tick(1999); expect(index()).toBe(0); tick(1); expect(index()).toBe(1);
  for (let i = 0; i < 5; i++) { click("pause"); click("play"); }
  expect(vi.getTimerCount()).toBe(1); tick(1200); expect(index()).toBe(2);
});
it("preference rerenders preserve timing and frame, without moving focus", () => {
  root.focus.mockClear(); click("play"); tick(1500); render(); render(); tick(500);
  expect(index()).toBe(1); expect(root.focus).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(1);
});
it("manual buttons and street selections cancel playback even at the current street", () => {
  click("play"); tick(500); click("next"); tick(5000); expect(index()).toBe(1);
  click("play"); click("previous"); tick(5000); expect(index()).toBe(0);
  click("play"); const street = nodes(tree).find(n => n.props["aria-pressed"] === true)!;
  street.props.onClick!(); render(); tick(5000); expect(index()).toBe(0); expect(vi.getTimerCount()).toBe(0);
});
it("hidden tabs, activity changes and overlays pause until explicit Play", () => {
  click("play"); doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange")); render();
  doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange")); tick(5000); expect(index()).toBe(0);
  click("play"); render(replay, false); render(); tick(5000); expect(index()).toBe(0);
  click("play"); overlay = true; observe(); render(); overlay = false; observe(); tick(5000); expect(index()).toBe(0);
  click("play"); tick(2000); expect(index()).toBe(1);
});
it("hand replacement resets position paused and unmount cancels pending callbacks", () => {
  click("play"); tick(2000); expect(index()).toBe(1);
  const replacement = { ...replay, frames: replay.frames.slice(0, 2) };
  render(replacement); render(replacement); tick(5000); render(replacement); expect(index()).toBe(0);
  click("play"); h.cleanups.forEach(fn => fn()); expect(vi.getTimerCount()).toBe(0);
});

it("arrow navigation cancels playback, including at a boundary", () => {
  click("play");
  win.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: "ArrowRight" }));
  render(); tick(5000); expect(index()).toBe(1);
  click("previous"); click("play");
  win.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: "ArrowLeft" }));
  render(); tick(5000); expect(index()).toBe(0); expect(vi.getTimerCount()).toBe(0);
});
it("a cancelled callback cannot advance a replacement hand or interfere with its timer", () => {
  const timeout = vi.spyOn(globalThis, "setTimeout");
  click("play");
  const stale = timeout.mock.calls.at(-1)![0] as () => void;
  const replacement = { ...replay };
  render(replacement); render(replacement); click("play");
  stale(); render(replacement); expect(index()).toBe(0); expect(vi.getTimerCount()).toBe(1);
  click("pause"); expect(vi.getTimerCount()).toBe(0); timeout.mockRestore();
});
