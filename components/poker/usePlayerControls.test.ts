/* eslint-disable react-hooks/rules-of-hooks -- Deterministic hook driver with render retries and effect cleanup. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gameplayGame } from "@/test/fixtures/gameplay";
import { foldDecision } from "./fold-confirmation";
import { observeTurnClock } from "./turn-clock";
import type { Game } from "./types";

const h = vi.hoisted(() => ({
  slots: [] as unknown[], index: 0, dirty: false, deps: [] as (readonly unknown[] | undefined)[],
  pending: new Map<number, () => void | (() => void)>(),
  effects: new Map<number, () => void | (() => void)>(), cleanups: new Map<number, () => void>(),
}));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const i = h.index++;
    if (!(i in h.slots)) h.slots[i] = initial;
    return [h.slots[i], (value: unknown) => { h.slots[i] = value; h.dirty = true; }];
  },
  useCallback(callback: unknown) { return callback; },
  useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
    const i = h.index++;
    if (!h.deps[i] || deps.some((v, n) => !Object.is(v, h.deps[i]?.[n]))) h.pending.set(i, effect);
    h.deps[i] = deps;
  },
}));
import { usePlayerControls } from "./usePlayerControls";

class Element extends EventTarget {
  tagName = "DIV"; isContentEditable = false; native = false;
  closest() { return this.native ? this : null; }
}
class Input extends Element { type = "text"; }
let win: EventTarget;
let active: Element;
let options: Parameters<typeof usePlayerControls>[0];
function cleanup() { h.cleanups.forEach(fn => fn()); h.cleanups.clear(); }
function flush() {
  for (const [i, effect] of h.pending) {
    h.cleanups.get(i)?.();
    const c = effect(); h.effects.set(i, effect);
    if (c) h.cleanups.set(i, c); else h.cleanups.delete(i);
  }
  h.pending.clear();
}
function render(flushEffects = true) {
  h.index = 0; h.dirty = false;
  const controls = usePlayerControls(options);
  // Read the first render's result too: stale drafts cannot flash before retry/effects.
  if (h.dirty) {
    const settled = render(false);
    expect(controls.amount).toBe(settled.amount);
  }
  if (flushEffects) flush();
  return controls;
}
function key(key: string, modifiers: Record<string, unknown> = {}, target: EventTarget = win) {
  const { defaultPrevented, ...keys } = modifiers;
  const event = Object.assign(new Event("keydown", { cancelable: true }), { key, ...keys });
  if (defaultPrevented) event.preventDefault();
  if (target !== win) Object.defineProperty(event, "target", { value: target });
  win.dispatchEvent(event); return event;
}
function freeCheck(): Game {
  return { ...gameplayGame, poker: { ...gameplayGame.poker, legalActions: [{ type: "fold" }, { type: "check" }] } };
}
function timed() {
  const game = { ...freeCheck(), serverTime: "2026-10-20T00:00:00Z", turnTimer: {
    decisionId: "decision", handNumber: 1, actorEngineId: "human", deadline: "2026-10-20T00:00:01Z",
  } };
  observeTurnClock(game); return game;
}
beforeEach(() => {
  vi.useFakeTimers(); h.slots = []; h.deps = []; h.pending.clear(); h.effects.clear(); h.cleanups.clear();
  win = new EventTarget(); active = new Element();
  vi.stubGlobal("window", win); vi.stubGlobal("document", { activeElement: active, body: new Element() });
  vi.stubGlobal("HTMLElement", Element); vi.stubGlobal("HTMLInputElement", Input);
  options = {
    game: structuredClone(gameplayGame), viewerToken: "owner", readViewerToken: () => "owner",
    actionsBlocked: false, loading: false, creatingQuickPlay: false, quickPlayCreationPending: { current: false },
    shortcuts: true, overlay: { kind: "none" }, canStartNextHand: false, tableRef: { current: new Element() as unknown as HTMLElement },
    openFoldConfirmation: vi.fn(), closeOverlay: vi.fn(), submitAction: vi.fn(), beginNextHand: vi.fn(), revealCards: vi.fn(),
  };
});
afterEach(() => { cleanup(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("preserves valid and invalid drafts on same-decision refreshes and resets synchronously for changed game/version/viewer", () => {
  for (const draft of ["525", "", "oops"]) {
    render().setAmount(draft); options = { ...options, game: structuredClone(gameplayGame) };
    expect(render().amount).toBe(draft);
  }
  for (const game of [{ ...gameplayGame, id: "other" }, { ...gameplayGame, version: 3 },
    { ...gameplayGame, version: 4, poker: { ...gameplayGame.poker, currentActorId: "bot" } }]) {
    render().setAmount("525"); options = { ...options, game };
    expect(render(false).amount).toBe("200"); flush();
  }
  render().setAmount("525"); options = { ...options, viewerToken: "spectator" };
  expect(render(false).amount).toBe("200"); flush();
});
it.each(["", " ", "100.5", "-1", "1001", "9007199254740992"])("blocks sized intents with invalid draft %j while allowing call", draft => {
  render().setAmount(draft); const controls = render();
  expect(controls.selectedAmount).toBeNull();
  controls.handleActionIntent(controls.sizedAction!); key("d");
  expect(options.submitAction).not.toHaveBeenCalled();
  key("s"); expect(options.submitAction).toHaveBeenCalledExactlyOnceWith({ type: "call", amount: 50 }, 50);
});
it.each(["busy", "recovery", "overlay", "creation", "ownership", "departure", "actor", "expired"])("blocks click and shortcut submissions for %s", reason => {
  if (reason === "busy" || reason === "recovery") options = { ...options, actionsBlocked: true };
  if (reason === "overlay") options = { ...options, overlay: { kind: "help" } };
  if (reason === "creation") options.quickPlayCreationPending.current = true;
  if (reason === "ownership") options = { ...options, viewerToken: "spectator" };
  if (reason === "departure") options = { ...options, game: { ...gameplayGame, poker: { ...gameplayGame.poker, players: gameplayGame.poker.players.map(p => ({ ...p, leaving: true })) } } };
  if (reason === "actor") options = { ...options, game: { ...gameplayGame, poker: { ...gameplayGame.poker, currentActorId: "bot" } } };
  if (reason === "expired") { options = { ...options, game: timed() }; vi.advanceTimersByTime(1100); }
  render().handleActionIntent({ type: "call", amount: 50 }, 50); key("s");
  expect(options.submitAction).not.toHaveBeenCalled();
});
it("looks up the authoritative action and ignores missing legal actions", () => {
  const controls = render(); controls.handleActionIntent({ type: "call", amount: 999 }, 50);
  expect(options.submitAction).toHaveBeenCalledExactlyOnceWith({ type: "call", amount: 50 }, 50);
  controls.handleActionIntent({ type: "bet", minAmount: 1, maxAmount: 20 }, 10);
  expect(options.submitAction).toHaveBeenCalledTimes(1);
});
it.each(["click", "shortcut"])("opens the same fold decision through %s without submitting and selects the return target", source => {
  options = { ...options, game: freeCheck() }; const controls = render();
  if (source === "click") controls.handleActionIntent({ type: "fold" }); else key("a");
  expect(options.openFoldConfirmation).toHaveBeenCalledExactlyOnceWith(foldDecision(options.game, "owner", false), active);
  expect(options.submitAction).not.toHaveBeenCalled();
  const opener = new Element(); controls.handleActionIntent({ type: "fold" }, null, opener as unknown as HTMLElement);
  expect(options.openFoldConfirmation).toHaveBeenLastCalledWith(foldDecision(options.game, "owner", false), opener);
  vi.stubGlobal("document", { activeElement: null, body: new Element() });
  controls.handleActionIntent({ type: "fold" });
  expect(options.openFoldConfirmation).toHaveBeenLastCalledWith(foldDecision(options.game, "owner", false), options.tableRef.current);
});
it("re-reads fold ownership at event time", () => {
  let token = "owner"; options = { ...options, game: freeCheck(), readViewerToken: () => token };
  render(); token = "changed"; key("a"); expect(options.openFoldConfirmation).not.toHaveBeenCalled();
});
it("disables preference listeners and filters editable targets, native activation, modifiers and repeat", () => {
  options = { ...options, shortcuts: false }; render(); key("s");
  expect(options.submitAction).not.toHaveBeenCalled();
  options = { ...options, shortcuts: true }; render();
  for (const mods of [{ repeat: true }, { metaKey: true }, { ctrlKey: true }, { altKey: true }, { defaultPrevented: true }]) key("s", mods);
  for (const target of [new Input(), Object.assign(new Element(), { tagName: "TEXTAREA" }),
    Object.assign(new Element(), { tagName: "SELECT" }), Object.assign(new Element(), { isContentEditable: true })]) key("s", {}, target);
  expect(options.submitAction).not.toHaveBeenCalled();
  key("s", {}, Object.assign(new Input(), { type: "range" }));
  expect(options.submitAction).toHaveBeenCalledOnce();
  options = { ...options, canStartNextHand: true }; render();
  for (const tagName of ["BUTTON", "A"]) for (const k of ["Enter", " "]) {
    expect(key(k, {}, Object.assign(new Element(), { native: true, tagName })).defaultPrevented).toBe(false);
  }
  expect(options.beginNextHand).not.toHaveBeenCalled();
});
it("sizes by one/five blinds, clamps, supports ranges and recovers an invalid draft", () => {
  render().setAmount("425"); render();
  for (const [k, shiftKey, expected] of [["e", false, "525"], ["q", false, "425"], ["ArrowRight", true, "925"],
    ["ArrowRight", false, "1000"], ["ArrowLeft", true, "500"], ["Q", true, "200"]] as const) {
    expect(key(k, { shiftKey }, Object.assign(new Input(), { type: "range" })).defaultPrevented).toBe(true);
    expect(render().amount).toBe(expected);
  }
  render().setAmount(""); render(); key("E", { shiftKey: true }); expect(render().amount).toBe("700");
});
it("retains sizing while mutation-blocked as characterized, but never submits", () => {
  options = { ...options, actionsBlocked: true }; render(); key("e");
  expect(render().amount).toBe("300"); key("d"); expect(options.submitAction).not.toHaveBeenCalled();
});
it("handles completed-hand Next hand and Show cards, with no betting shortcuts", () => {
  options = { ...options, game: { ...freeCheck(), status: "complete", poker: { ...freeCheck().poker,
    street: "complete", completionReason: "fold", players: gameplayGame.poker.players.map(p => ({ ...p, cardsRevealed: false })) } }, canStartNextHand: true };
  render();
  for (const k of ["s", "Enter", " "]) expect(key(k).defaultPrevented).toBe(true);
  expect(options.beginNextHand).toHaveBeenCalledTimes(3);
  key("d"); expect(options.revealCards).toHaveBeenCalledOnce();
  key("a"); expect(options.submitAction).not.toHaveBeenCalled();
  options = { ...options, overlay: { kind: "actions" } }; render(); key("d"); key("s");
  expect(options.revealCards).toHaveBeenCalledOnce(); expect(options.beginNextHand).toHaveBeenCalledTimes(3);
});
it.each(["version", "ownership", "blocked", "expiry"])("reconciles fold %s and cleans its single interval on replacement/unmount", reason => {
  const game = timed(); options = { ...options, game, overlay: { kind: "foldConfirmation", decision: foldDecision(game, "owner", false)! } };
  render(); expect(vi.getTimerCount()).toBe(1);
  render(); expect(vi.getTimerCount()).toBe(1); expect(options.closeOverlay).not.toHaveBeenCalled();
  if (reason === "version") options = { ...options, game: { ...game, version: 3 } };
  if (reason === "ownership") options = { ...options, readViewerToken: () => "other" };
  if (reason === "blocked") options = { ...options, actionsBlocked: true };
  if (reason === "expiry") vi.advanceTimersByTime(1100); else render();
  expect(options.closeOverlay).toHaveBeenCalled(); expect(options.submitAction).not.toHaveBeenCalled();
  options = { ...options, overlay: { kind: "none" }, game: null }; render();
  expect(vi.getTimerCount()).toBe(0); key("s"); expect(options.submitAction).not.toHaveBeenCalled();
});
it("effect cleanup and re-execution leave one listener/interval and unmount leaves neither", () => {
  const game = freeCheck(); options = { ...options, game, overlay: { kind: "foldConfirmation", decision: foldDecision(game, "owner", false)! } };
  render(); cleanup();
  for (const [i, effect] of h.effects) { const c = effect(); if (c) h.cleanups.set(i, c); }
  expect(vi.getTimerCount()).toBe(1);
  options = { ...options, overlay: { kind: "none" } }; render();
  cleanup();
  for (const [i, effect] of h.effects) { const c = effect(); if (c) h.cleanups.set(i, c); }
  key("s"); expect(options.submitAction).toHaveBeenCalledExactlyOnceWith({ type: "check" }, null);
  cleanup(); key("s"); expect(options.submitAction).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
