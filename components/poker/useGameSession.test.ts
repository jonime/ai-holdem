import type { GameTranslator } from "@/lib/i18n/types";
/* eslint-disable react-hooks/rules-of-hooks -- This test drives hook slots without a React renderer. */
import { beforeEach, expect, it, vi } from "vitest";
import { gameplayGame } from "@/test/fixtures/gameplay";
import { TransportError } from "@/lib/http/api";

// Minimal hook driver: preserve hook slots across renders and execute only session
// ownership effects. Network operations and lifecycle callbacks remain explicit.
const h = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, passive: [] as (() => void | (() => void))[], effects: [] as (() => void | (() => void))[], cleanups: [] as (() => void)[], push: vi.fn(), read: vi.fn(), settings: vi.fn(), start: vi.fn(), action: vi.fn(), release: vi.fn(), claim: vi.fn(), rename: vi.fn(), suspend: vi.fn() }));
vi.mock("react", () => ({
  useState: (initial: unknown) => { const i = h.index++; if (!(i in h.slots)) h.slots[i] = typeof initial === "function" ? initial() : initial; return [h.slots[i], (value: unknown) => { h.slots[i] = value; }]; },
  useRef: (initial: unknown) => { const i = h.index++; if (!(i in h.slots)) h.slots[i] = { current: initial }; return h.slots[i]; },
  useCallback: (fn: unknown) => fn,
  useLayoutEffect: (fn: () => void | (() => void)) => { h.effects.push(fn); },
  useEffect: (fn: () => void | (() => void)) => { h.passive.push(fn); },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("./useGameFeed", () => ({ useGameFeed: () => ({ feed: null, refreshFeed: vi.fn() }) }));
vi.mock("./useBotLifecycle", () => ({ useBotLifecycle: () => ({ lifecycle: { reconcile: vi.fn(), suspend: h.suspend, clearNotice: vi.fn(), reset: vi.fn() }, loading: false, retry: vi.fn() }) }));
vi.mock("./I18nProvider", () => ({ useI18n: () => ({ locale: "en-US", t: ((key) => key) satisfies GameTranslator }) }));
vi.mock("@/lib/realtime/useGameChannel", () => ({ useGameChannel: () => "subscribed" }));
vi.mock("@/lib/identity/player-token-client", () => ({ getClientPlayerToken: () => "owner" }));
vi.mock("@/lib/http/api", async importOriginal => ({ ...await importOriginal<object>(), api: {
  games: { get: h.read, settings: h.settings, start: h.start, submitAction: h.action },
  seats: { release: h.release, claim: h.claim, rename: h.rename },
} }));
import { useGameSession } from "./useGameSession";
function render(id = gameplayGame.id) { h.index = 0; h.effects = []; h.passive = []; return useGameSession(id); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function fixture() {
  render();
  for (const effect of h.effects) { const cleanup = effect(); if (cleanup) h.cleanups.push(cleanup); }
  await Promise.resolve();
  const session = render();
  await session.loadGame(gameplayGame.id);
  return render();
}
beforeEach(() => {
  vi.stubGlobal("navigator", { onLine: true });
  h.slots = []; h.cleanups = []; vi.clearAllMocks();
  vi.stubGlobal("window", { localStorage: { setItem: vi.fn() } });
  h.read.mockResolvedValue({ game: gameplayGame });
  h.action.mockResolvedValue({ game: gameplayGame });
  h.release.mockResolvedValue({});
});
it("synchronously prevents duplicate clicks and keyboard mutations", async () => {
  const session = await fixture();
  const held = deferred<{ game: typeof gameplayGame }>(); h.action.mockReturnValueOnce(held.promise);
  const first = session.submitAction({ type: "fold" });
  await session.submitAction({ type: "fold" });
  expect(h.action).toHaveBeenCalledOnce();
  held.resolve({ game: gameplayGame }); await first;
  expect(render().loading).toBe(false);
});
it("refreshes unknown outcomes once, without replay, then permits a new explicit decision", async () => {
  const session = await fixture(); h.read.mockClear();
  h.action.mockRejectedValueOnce(new TransportError("deadline", "timeout"));
  await session.submitAction({ type: "fold" });
  expect(h.read).toHaveBeenCalledOnce(); expect(h.action).toHaveBeenCalledOnce();
  expect(render()).toMatchObject({ error: "errors.actionReconciled", loading: false });
  await render().submitAction({ type: "fold" }); expect(h.action).toHaveBeenCalledTimes(2);
});
it("failed reconciliation releases the spinner and blocks mutations until an authoritative read succeeds", async () => {
  const session = await fixture(); h.action.mockRejectedValueOnce(new TransportError("network", "offline"));
  h.read.mockRejectedValueOnce(new TypeError("offline"));
  await session.submitAction({ type: "fold" });
  expect(render()).toMatchObject({ recoveryBlocked: true, navigationLoading: false });
  await render().submitAction({ type: "fold" }); expect(h.action).toHaveBeenCalledOnce();
  await render().loadGame(gameplayGame.id);
  expect(render().recoveryBlocked).toBe(false);
});
it("stops an uncertain settings/start workflow at settings", async () => {
  const session = await fixture(); h.settings.mockRejectedValueOnce(new TransportError("invalidResponse", "invalid"));
  await session.startWaitingGame({ seatCount: 2, smallBlind: 1, bigBlind: 2, startingStack: 100, botsShowUncontestedWins: false });
  expect(h.settings).toHaveBeenCalledOnce(); expect(h.start).not.toHaveBeenCalled();
});
it("uncertain departure stays on the table", async () => {
  const session = await fixture(); h.release.mockRejectedValueOnce(new TransportError("network", "offline"));
  await session.releaseSeat(0, true);
  expect(h.push).not.toHaveBeenCalled();
});
it("unmount aborts requests and late settings results never start a hand or change errors", async () => {
  const session = await fixture(); const held = deferred<{ game: typeof gameplayGame }>(); h.settings.mockReturnValueOnce(held.promise);
  const work = session.startWaitingGame({ seatCount: 2, smallBlind: 1, bigBlind: 2, startingStack: 100, botsShowUncontestedWins: false });
  const signal = h.settings.mock.calls[0][1].signal;
  h.cleanups.forEach(fn => fn()); expect(signal.aborted).toBe(true);
  held.resolve({ game: gameplayGame }); await work;
  expect(h.start).not.toHaveBeenCalled(); expect(render().error).toBeFalsy();
});
it("ordinary version conflicts and expired turns refresh without entering unknown recovery", async () => {
  const { HttpError } = await import("@/lib/http/api");
  const session = await fixture(); h.read.mockClear();
  for (const code of ["GAME_VERSION_CONFLICT", "TURN_EXPIRED"]) {
    h.action.mockRejectedValueOnce(new HttpError("stale", 409, code));
    await session.submitAction({ type: "fold" });
    expect(render()).toMatchObject({ recoveryBlocked: false, loading: false, diagnostics: [] });
  }
  expect(h.read).toHaveBeenCalledTimes(2);
});
it("acknowledged departures retain navigation", async () => {
  const session = await fixture();
  await session.releaseSeat(0, true);
  expect(h.push).toHaveBeenCalledWith("/play");
});
it("late rejected actions after navigation cannot start recovery or change another session", async () => {
  const session = await fixture(); h.read.mockClear();
  const held = deferred<never>(); h.action.mockReturnValueOnce(held.promise);
  const work = session.submitAction({ type: "fold" });
  h.cleanups.forEach(fn => fn());
  held.reject(new TransportError("network", "late")); await work;
  expect(h.read).not.toHaveBeenCalled(); expect(render().error).toBeFalsy();
});

it("keeps failed refresh visible during repeated reads and clears on unchanged-version success", async () => {
  const session = await fixture();
  h.read.mockRejectedValueOnce(new TypeError("network"));
  await expect(session.loadGame(gameplayGame.id)).rejects.toThrow();
  expect(render().connectionNotice).toBe("refreshFailed");
  const held = deferred<{ game: typeof gameplayGame }>(); h.read.mockReturnValueOnce(held.promise);
  const retry = render().loadGame(gameplayGame.id);
  expect(render().connectionNotice).toBe("refreshFailed");
  expect(render().refreshing).toBe(true);
  held.reject(new TypeError("network")); await expect(retry).rejects.toThrow();
  expect(render().connectionNotice).toBe("refreshFailed");
  await render().loadGame(gameplayGame.id);
  expect(render().connectionNotice).toBe("none");
});
it("online and subscription are not recovery; only an accepted read clears reconnecting", async () => {
  const session = await fixture();
  h.read.mockRejectedValueOnce(new TypeError("network"));
  await expect(session.loadGame(gameplayGame.id)).rejects.toThrow();
  const listeners = new Map<string, () => void>();
  vi.stubGlobal("window", { addEventListener: (event: string, fn: () => void) => listeners.set(event, fn) });
  vi.stubGlobal("document", { addEventListener: vi.fn() });
  // Only install the browser connectivity effect, keeping requests explicit.
  h.passive[3]();
  listeners.get("offline")!(); expect(render().connectionNotice).toBe("offline");
  listeners.get("online")!(); expect(render().connectionNotice).toBe("reconnecting");
  await render().loadGame(gameplayGame.id, () => false);
  expect(render().connectionNotice).toBe("reconnecting");
  await render().loadGame(gameplayGame.id);
  expect(render().connectionNotice).toBe("none");
});
it("navigation resets failures and fences late rejected and successful reads", async () => {
  const session = await fixture();
  h.read.mockRejectedValueOnce(new TypeError("network"));
  await expect(session.loadGame(gameplayGame.id)).rejects.toThrow();
  const held = deferred<{ game: typeof gameplayGame }>(); h.read.mockReturnValueOnce(held.promise);
  const late = render().loadGame(gameplayGame.id);
  h.cleanups.forEach(fn => fn());
  render("another-game"); for (const effect of h.effects) effect(); await Promise.resolve();
  held.resolve({ game: gameplayGame }); await late;
  expect(render("another-game").connectionNotice).toBe("none");
});
it("an older ignored read cannot clear a failure", async () => {
  const session = await fixture();
  const held = deferred<{ game: typeof gameplayGame }>(); h.read.mockReturnValueOnce(held.promise);
  const late = session.loadGame(gameplayGame.id);
  await session.loadGame(gameplayGame.id);
  h.read.mockRejectedValueOnce(new TypeError("network"));
  await expect(session.loadGame(gameplayGame.id)).rejects.toThrow();
  held.resolve({ game: gameplayGame }); await late;
  expect(render().connectionNotice).toBe("refreshFailed");
});

it("late failed reads cannot replace a newer successful read", async () => {
  const session = await fixture();
  const held = deferred<{ game: typeof gameplayGame }>(); h.read.mockReturnValueOnce(held.promise);
  const late = session.loadGame(gameplayGame.id);
  await session.loadGame(gameplayGame.id);
  held.reject(new TypeError("network")); await expect(late).rejects.toThrow();
  expect(render().connectionNotice).toBe("none");
});

it("a read deadline keeps the loaded table and exposes a refresh failure", async () => {
  const session = await fixture();
  h.read.mockRejectedValueOnce(new DOMException("Timed out", "AbortError"));
  await expect(session.loadGame(gameplayGame.id)).rejects.toThrow();
  expect(render()).toMatchObject({ game: gameplayGame, connectionNotice: "refreshFailed", refreshing: false });
});

it.each(["access", "write"])("successful claims and renames stay successful after storage %s failure", async failure => {
  const session = await fixture();
  if (failure === "access") Object.defineProperty(window, "localStorage", { get() { throw Error(); } });
  else vi.mocked(window.localStorage.setItem).mockImplementation(() => { throw Error("quota"); });
  h.claim.mockResolvedValue({}); h.rename.mockResolvedValue({});
  expect(await session.claimSeatAt(0, " Ada ")).toBe(true);
  expect(h.claim.mock.calls[0][0].name).toBe("Ada");
  expect(await render().updatePlayerName(0, "Grace")).toBe(true);
  expect(render().error).toBeFalsy();
});
it("failed name requests preserve their errors and rename does not save", async () => {
  const { readPlayerName } = await import("@/lib/browser/player-name");
  const session = await fixture();
  h.claim.mockRejectedValueOnce(new Error("Claim rejected"));
  expect(await session.claimSeatAt(0, "Claim preference")).toBe(false);
  expect(readPlayerName()).toBe("Claim preference"); expect(render().error).toBe("Claim rejected");
  h.rename.mockRejectedValueOnce(new Error("Rename rejected"));
  expect(await render().updatePlayerName(0, "Rejected")).toBe(false);
  expect(readPlayerName()).toBe("Claim preference"); expect(render().error).toBe("Rename rejected");
});

it("retains original and recovery diagnostics, then clears after authoritative recovery", async () => {
  const { captureDiagnostic } = await import("@/lib/http/diagnostics");
  const session = await fixture();
  const original = new TransportError("network", "PRIVATE original");
  const recovery = new TransportError("network", "PRIVATE recovery");
  captureDiagnostic(original, "games.submitAction"); captureDiagnostic(recovery, "games.get");
  h.action.mockRejectedValueOnce(original); h.read.mockRejectedValueOnce(recovery);
  await session.submitAction({ type: "fold" });
  expect(render().diagnostics.map(d => d.operation)).toEqual(["games.submitAction", "games.get"]);
  await render().loadGame(gameplayGame.id);
  expect(render().diagnostics).toEqual([]);
});
it("stale-session failure cannot install diagnostic details", async () => {
  const { captureDiagnostic } = await import("@/lib/http/diagnostics");
  const session = await fixture(); const held = deferred<never>(); h.action.mockReturnValueOnce(held.promise);
  const work = session.submitAction({ type: "fold" });
  h.cleanups.forEach(fn => fn());
  const failure = new TransportError("network", "PRIVATE"); captureDiagnostic(failure, "games.submitAction");
  held.reject(failure); await work;
  expect(render().diagnostics).toEqual([]);
});
