// Deterministic render/effect driver, including cleanup before re-execution.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { ComponentProps } from "react";
import { gameplayGame } from "@/test/fixtures/gameplay";

const h = vi.hoisted(() => ({
  slots: [] as unknown[], index: 0, dirty: false,
  deps: [] as (readonly unknown[] | undefined)[],
  pending: new Map<number, () => void | (() => void)>(),
  effects: new Map<number, () => void | (() => void)>(),
  cleanups: new Map<number, () => void>(),
  session: {} as Record<string, unknown>, token: "owner", shortcuts: true,
}));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState(initial: unknown) {
    const i = h.index++;
    if (!(i in h.slots)) h.slots[i] = typeof initial === "function" ? initial() : initial;
    return [h.slots[i], (value: unknown) => {
      const next = typeof value === "function" ? value(h.slots[i]) : value;
      if (!Object.is(next, h.slots[i])) { h.dirty = true; h.slots[i] = next; }
    }];
  },
  useRef(initial: unknown) {
    const i = h.index++;
    if (!(i in h.slots)) h.slots[i] = { current: initial };
    return h.slots[i];
  },
  useCallback(callback: unknown) { return callback; },
  useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
    const i = h.index++;
    if (!h.deps[i] || deps.some((v, n) => !Object.is(v, h.deps[i]?.[n]))) h.pending.set(i, effect);
    h.deps[i] = deps;
  },
  useLayoutEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
    const i = h.index++;
    if (!h.deps[i] || deps.some((v, n) => !Object.is(v, h.deps[i]?.[n]))) h.pending.set(i, effect);
    h.deps[i] = deps;
  },
}));
vi.mock("./useGameSession", () => ({ useGameSession: () => h.session }));
vi.mock("./useSettings", () => ({ useSettings: () => ({ ready: true, preferences: { gameplayShortcuts: h.shortcuts } }) }));
vi.mock("@/lib/identity/player-token-client", () => ({ getClientPlayerToken: () => h.token }));
vi.mock("./I18nProvider", () => ({ useI18n: () => ({ locale: "en-US", t: (key: string) => key }) }));
vi.mock("@/components/creation/useCreation", () => ({ useCreation: () => ({ working: false, hasPending: false }) }));
vi.mock("@/lib/browser/player-name", () => ({ usePlayerName: () => "Human" }));
vi.mock("./useActionsPreference", () => ({ useActionsPreference: () => ({ collapsed: true }) }));
vi.mock("./useHandAnnouncements", () => ({ useHandAnnouncements: () => {} }));
vi.mock("./useTurnNotifications", () => ({ useTurnNotifications: () => ({}) }));
vi.mock("./AmountDisplay", () => ({ AmountDisplayProvider: () => null }));
vi.mock("@/components/CopyErrorDetails", () => ({ GameErrorDetails: () => null }));
vi.mock("@/components/creation/CreationFeedback", () => ({ CreationFeedback: () => null }));
vi.mock("./FoldConfirmationDialog", () => ({ FoldConfirmationDialog: () => null }));
vi.mock("./ConfirmationDialog", () => ({ ConfirmationDialog: () => null }));
vi.mock("./HandReplayModal", () => ({ HandReplayModal: () => null }));
vi.mock("./ShareTableModal", () => ({ ShareTableModal: () => null }));
vi.mock("./Modal", () => ({ Modal: () => null }));
vi.mock("./ModalTurnWarning", () => ({ ModalTurnProvider: () => null }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("./BotInformationModal", () => ({ BotInformationModal: () => null }));
vi.mock("./SettingsModal", () => ({ SettingsModal: () => null }));
vi.mock("./TableLoadingShell", () => ({ TableLoadingIndicator: () => null }));
vi.mock("./HelpModal", () => ({ HelpModal: () => null }));
vi.mock("./GameHeader", () => ({ GameHeader: () => null }));
vi.mock("./ActionFeedPanel", () => ({ ActionFeedModal: () => null, ActionFeedPanel: () => null }));
vi.mock("@/components/Button", () => ({ Button: () => null }));
vi.mock("./LobbyPanel", () => ({ LobbyPanel: () => null }));
vi.mock("./PokerTable", () => ({ PokerTable: () => null }));
vi.mock("./PersonalResultsModal", () => ({ PersonalResultsModal: () => null }));

import PokerApp from "./PokerApp";
import { PokerTable } from "./PokerTable";
import { FoldConfirmationDialog } from "./FoldConfirmationDialog";
import { GameHeader } from "./GameHeader";

class Element extends EventTarget {
  tagName = "DIV"; isContentEditable = false; native = false;
  closest() { return this.native ? this : null; }
}
class Input extends Element { type = "text"; }
let win: EventTarget;
let active: Element;
let tree: ReactElement;
function props<T>(type: unknown, node: unknown = tree): T {
  if (Array.isArray(node)) {
    for (const child of node) { const found = props<T>(type, child ?? null); if (found) return found; }
  } else if (node && typeof node === "object" && "props" in node) {
    const element = node as ReactElement<{ children?: unknown }>;
    if (element.type === type) return element.props as T;
    return props<T>(type, element.props.children ?? null);
  }
  return undefined as T;
}
function flush() {
  for (const [i, effect] of h.pending) {
    h.cleanups.get(i)?.();
    const cleanup = effect();
    h.effects.set(i, effect);
    if (cleanup) h.cleanups.set(i, cleanup); else h.cleanups.delete(i);
  }
  h.pending.clear();
}
function render(gameId = "game-1") {
  do { h.index = 0; h.dirty = false; tree = PokerApp({ gameId, helpTitle: "Help", helpContent: null }); } while (h.dirty);
  flush();
  return props<ComponentProps<typeof PokerTable>>(PokerTable);
}
function key(key: string, options: Record<string, unknown> = {}, target: EventTarget = win) {
  const event = Object.assign(new Event("keydown", { cancelable: true }), { key, ...options });
  if (target !== win) Object.defineProperty(event, "target", { value: target });
  win.dispatchEvent(event);
  return event;
}
function cleanup() { h.cleanups.forEach(fn => fn()); h.cleanups.clear(); }
beforeEach(() => {
  vi.useFakeTimers(); h.slots = []; h.deps = []; h.pending.clear(); h.effects.clear(); h.cleanups.clear(); h.token = "owner"; h.shortcuts = true;
  h.session = { game: structuredClone(gameplayGame), online: true, submitAction: vi.fn(), beginNextHand: vi.fn(), revealCards: vi.fn() };
  win = new EventTarget(); active = new Element();
  vi.stubGlobal("window", win); vi.stubGlobal("document", { activeElement: active, body: new Element() });
  vi.stubGlobal("HTMLElement", Element); vi.stubGlobal("HTMLInputElement", Input);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("characterizes draft preservation on refresh and synchronous reset before effects on a new decision", () => {
  render().setAmount("525");
  expect(render().amount).toBe("525");
  h.session.game = structuredClone(gameplayGame);
  expect(render().amount).toBe("525");
  h.session.game = { ...gameplayGame, version: 3 };
  expect(render().amount).toBe("200");
});
it("characterizes identical click/shortcut submissions using current legal actions", () => {
  const table = render();
  table.onSubmitAction({ type: "call", amount: 999 }, 50);
  key("s");
  expect(h.session.submitAction).toHaveBeenNthCalledWith(1, { type: "call", amount: 50 }, 50);
  expect(h.session.submitAction).toHaveBeenNthCalledWith(2, { type: "call", amount: 50 }, 50);
  render().setAmount("525"); render(); key("d");
  expect(h.session.submitAction).toHaveBeenLastCalledWith({ type: "raise", minAmount: 200, maxAmount: 1000 }, 525);
});
it.each(["click", "shortcut"])("characterizes free-check fold confirmation through %s and confirmed submission", source => {
  h.session.game = { ...gameplayGame, poker: { ...gameplayGame.poker, legalActions: [{ type: "fold" }, { type: "check" }] } };
  const table = render();
  if (source === "click") table.onSubmitAction({ type: "fold" }); else key("a");
  render();
  const dialog = props<ComponentProps<typeof FoldConfirmationDialog>>(FoldConfirmationDialog);
  expect(dialog.restoreFocus.current).toBe(active);
  expect(h.session.submitAction).not.toHaveBeenCalled();
  dialog.onAction("check"); render();
  expect(h.session.submitAction).toHaveBeenCalledExactlyOnceWith({ type: "check" });
});
it("characterizes overlay suppression and listener cleanup/re-execution", () => {
  render();
  props<ComponentProps<typeof GameHeader>>(GameHeader).onHelp(active as unknown as HTMLButtonElement);
  render(); key("s"); expect(h.session.submitAction).not.toHaveBeenCalled();
  cleanup();
  for (const [i, effect] of h.effects) { const c = effect(); if (c) h.cleanups.set(i, c); }
  key("s"); expect(h.session.submitAction).not.toHaveBeenCalled();
  cleanup(); key("s"); expect(h.session.submitAction).not.toHaveBeenCalled();
});
