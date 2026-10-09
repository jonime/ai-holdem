import { afterEach, describe, expect, it, vi } from "vitest";
import { pokerEngineAdapter, createDeterministicDeck } from "@/lib/poker/adapter";
import { HttpError } from "@/lib/http/api";
import { LLM_CREDIT_EXIT_RULE } from "@/lib/bots/types";
import { BotLifecycle } from "./useBotLifecycle";
import { botRetryAfterMs } from "./bot-lifecycle";
import type { AIDecision, Game } from "./types";

const state = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({
  smallBlind: 50, bigBlind: 100, players: [
    { id: "human", name: "Human", controller: "human", seat: 0, stack: 1000, playerToken: "owner" },
    { id: "bot", name: "Bot", controller: "bot", seat: 1, stack: 1000 },
  ],
}), createDeterministicDeck());
const initial: Game = { id: "game", status: "playing", version: 1, viewerIsHost: false,
  poker: pokerEngineAdapter.publicProjection(pokerEngineAdapter.applyAction(state, "human", { type: "call", amount: 50 }), "human") };
const decision: AIDecision = { action: "check", amount: null, bot: { id: "rules", label: "Rules", provider: "rules", modelId: null },
  botProfileId: null, probabilities: null, confidence: null, sizing: null, matchedRule: null };
const humanTurn = (game: Game): Game => ({ ...game, version: game.version + 1, poker: { ...game.poker, currentActorId: "human" } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  let game = initial;
  let sequence = 0;
  const driver = {
    readGame: () => game, viewerToken: () => "owner",
    step: vi.fn(async (current: Game) => ({ result: { game: humanTurn(current), aiDecision: decision }, sequence: ++sequence })),
    apply: vi.fn((incoming: Game) => { game = incoming; lifecycle.reconcile(game); return true; }),
    refresh: vi.fn(async (_gameId: string, isCurrent: () => boolean) => { if (isCurrent()) lifecycle.reconcile(game); }),
    refreshFailed: vi.fn(), clearError: vi.fn(),
    errorMessage: (error: unknown) => error instanceof Error ? error.message : "failure",
    unfinishedMessage: () => "retry required", creditMessage: () => "credits",
  };
  const lifecycle = new BotLifecycle(driver);
  lifecycle.reset(game.id);
  const reconcile = (incoming: Game) => { game = incoming; lifecycle.reconcile(game); };
  return { lifecycle, driver, reconcile, game: () => game };
}
afterEach(() => { vi.useRealTimers(); });

describe("bot lifecycle execution (characterized advancement and pause policies)", () => {
  it("guards automatic, continuation and retry entry points while a step is pending", async () => {
    const f = fixture();
    const held = deferred<Awaited<ReturnType<typeof f.driver.step>>>();
    f.driver.step.mockReturnValue(held.promise);
    const loop = f.lifecycle.advance(f.game(), true);
    await f.lifecycle.advance(f.game());
    await f.lifecycle.advance(f.game(), true);
    await f.lifecycle.retry();
    expect(f.driver.step).toHaveBeenCalledOnce();
    expect(f.driver.refresh).not.toHaveBeenCalled();
    held.resolve({ result: { game: humanTurn(f.game()), aiDecision: decision }, sequence: 1 });
    await loop;
    expect(f.lifecycle.getSnapshot().kind).toBe("idle");
  });
  it("provider failures stay paused across repeated and version-only polling", async () => {
    const f = fixture();
    f.driver.step.mockRejectedValue(new HttpError("provider", 502, "BOT_TIMEOUT"));
    await f.lifecycle.advance(f.game(), true);
    for (let version = 1; version <= 4; version++) {
      f.reconcile({ ...f.game(), version });
      await f.lifecycle.advance(f.game(), true);
      await f.lifecycle.advance(f.game());
    }
    expect(f.driver.step).toHaveBeenCalledOnce();
    expect(f.lifecycle.getSnapshot()).toMatchObject({ kind: "paused", reason: "provider" });
  });
  it.each(["BOT_STEP_IN_PROGRESS", "OWNER_AI_LIMIT", "GAME_AI_RATE_LIMIT"])("%s expiry never starts inference", async code => {
    vi.useFakeTimers();
    const f = fixture();
    f.driver.step.mockRejectedValue(new HttpError("wait", 409, code, 1000));
    await f.lifecycle.advance(f.game(), true);
    const deadline = Date.now() + 1000;
    if (code !== "BOT_STEP_IN_PROGRESS") {
      await f.lifecycle.retry();
      expect(f.driver.refresh).not.toHaveBeenCalled();
      expect(botRetryAfterMs(f.lifecycle.getSnapshot())).toBe(1000);
    }
    f.reconcile({ ...f.game() });
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.lifecycle.getSnapshot()).toMatchObject(code === "BOT_STEP_IN_PROGRESS"
      ? { kind: "paused", reason: "claimExpired", notice: "retry required" }
      : { kind: "usageLimited", deadline });
    await f.lifecycle.advance(f.game(), true);
    expect(f.driver.step).toHaveBeenCalledOnce();
    f.driver.step.mockResolvedValue({ result: { game: humanTurn(f.game()), aiDecision: decision }, sequence: 2 });
    await f.lifecycle.retry();
    expect(f.driver.refresh).toHaveBeenCalledOnce();
    expect(f.driver.step).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("a retry refresh and simultaneous polling share the single guard and latest game", async () => {
    const f = fixture();
    f.driver.step.mockRejectedValueOnce(new Error("provider"));
    await f.lifecycle.advance(f.game());
    const held = deferred<void>();
    f.driver.refresh.mockImplementation(() => held.promise);
    const retry = f.lifecycle.retry();
    f.reconcile({ ...f.game(), version: 4 });
    await f.lifecycle.advance(f.game(), true);
    await f.lifecycle.advance(f.game());
    await f.lifecycle.retry();
    expect(f.driver.step).toHaveBeenCalledOnce();
    expect(f.driver.refresh).toHaveBeenCalledOnce();
    held.resolve();
    await retry;
    expect(f.driver.step).toHaveBeenLastCalledWith(expect.objectContaining({ version: 4 }));
    expect(f.driver.step).toHaveBeenCalledTimes(2);
  });
  it("retry refresh failures remain visible and require another manual retry", async () => {
    const f = fixture();
    f.driver.step.mockRejectedValueOnce(new Error("provider"));
    await f.lifecycle.advance(f.game());
    f.driver.refresh.mockRejectedValueOnce(new Error("refresh failed"));
    await f.lifecycle.retry();
    expect(f.lifecycle.getSnapshot()).toMatchObject({ kind: "paused", reason: "retryRefresh", notice: "refresh failed" });
    f.reconcile({ ...f.game(), version: 2 });
    await f.lifecycle.advance(f.game(), true);
    expect(f.driver.step).toHaveBeenCalledOnce();
    await f.lifecycle.retry();
    expect(f.driver.step).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])("conflict refresh is silent unless refresh fails (%s)", async fails => {
    const f = fixture();
    f.driver.step.mockRejectedValue(new HttpError("conflict", 409, "GAME_VERSION_CONFLICT"));
    if (fails) f.driver.refresh.mockRejectedValue(new Error("refresh failed"));
    await f.lifecycle.advance(f.game());
    expect(f.driver.refresh).toHaveBeenCalledOnce();
    expect(f.driver.step).toHaveBeenCalledOnce();
    expect(f.lifecycle.getSnapshot().notice).toBe(fails ? "refresh failed" : null);
    if (fails) expect(f.driver.refreshFailed).toHaveBeenCalledWith(true);
  });
  it.each([false, true])("lost claim immediately refreshes, same-version retry required (%s advancement)", async advanced => {
    const f = fixture();
    f.driver.step.mockRejectedValueOnce(new HttpError("lost", 409, "BOT_STEP_CLAIM_LOST"));
    f.driver.refresh.mockImplementation(async () => { if (advanced) f.reconcile({ ...f.game(), version: 2 }); });
    await f.lifecycle.advance(f.game());
    expect(f.driver.refresh).toHaveBeenCalledOnce();
    expect(f.lifecycle.getSnapshot()).toMatchObject(advanced ? { kind: "idle", notice: null } : { kind: "paused", reason: "claimLost", notice: "retry required" });
    await f.lifecycle.advance(f.game(), true);
    expect(f.driver.step).toHaveBeenCalledTimes(advanced ? 2 : 1);
  });
  it.each(["navigation", "eligibility", "turn"])("invalidates late responses synchronously after %s changes", async change => {
    const f = fixture();
    const held = deferred<Awaited<ReturnType<typeof f.driver.step>>>();
    f.driver.step.mockReturnValueOnce(held.promise);
    const loop = f.lifecycle.advance(f.game());
    if (change === "navigation") {
      f.lifecycle.reset("other");
      f.lifecycle.reset("game");
    } else if (change === "eligibility") {
      f.reconcile({ ...initial, poker: { ...initial.poker, players: initial.poker.players.map(p => ({ ...p, playerToken: null })) } });
      f.reconcile(initial);
    } else if (change === "turn") {
      f.reconcile(humanTurn(initial));
      f.reconcile({ ...initial, version: 3 });
    }
    held.resolve({ result: { game: humanTurn(initial), aiDecision: decision }, sequence: 1 });
    await loop;
    expect(f.driver.apply).not.toHaveBeenCalled();
  });
  it("a pending provider failure remains paused after a same-turn version refresh", async () => {
    const f = fixture();
    const held = deferred<Awaited<ReturnType<typeof f.driver.step>>>();
    f.driver.step.mockReturnValueOnce(held.promise);
    const loop = f.lifecycle.advance(f.game());
    f.reconcile({ ...f.game(), version: 2 });
    held.reject(new Error("provider"));
    await loop;
    await f.lifecycle.advance(f.game(), true);
    expect(f.lifecycle.getSnapshot()).toMatchObject({ kind: "paused", reason: "provider" });
    expect(f.driver.step).toHaveBeenCalledOnce();
  });
  it("a competing same-turn commit rejects an obsolete result through session reconciliation", async () => {
    const f = fixture();
    const held = deferred<Awaited<ReturnType<typeof f.driver.step>>>();
    f.driver.step.mockReturnValueOnce(held.promise);
    const loop = f.lifecycle.advance(f.game());
    f.reconcile({ ...f.game(), version: 4 });
    f.driver.apply.mockReturnValue(false);
    held.resolve({ result: { game: { ...initial, version: 2 }, aiDecision: decision }, sequence: 1 });
    await loop;
    expect(f.driver.step).toHaveBeenCalledOnce();
    expect(f.game().version).toBe(4);
  });
  it.each(["navigation", "eligibility"])("invalidates a retry refresh after %s away and back", async change => {
    const f = fixture();
    const held = deferred<void>();
    f.driver.refresh.mockReturnValue(held.promise);
    const retry = f.lifecycle.retry();
    if (change === "navigation") { f.lifecycle.reset(); f.lifecycle.reset("game"); }
    else {
      f.reconcile({ ...initial, poker: { ...initial.poker, players: initial.poker.players.map(p => ({ ...p, playerToken: null })) } });
      f.reconcile(initial);
    }
    expect(f.driver.refresh.mock.calls[0][1]()).toBe(false);
    held.resolve();
    await retry;
    expect(f.driver.step).not.toHaveBeenCalled();
  });
  it("retains credit departure notice and only reports reconciled decisions", async () => {
    const f = fixture();
    f.driver.step.mockResolvedValueOnce({ result: { game: humanTurn(initial), aiDecision: { ...decision, matchedRule: LLM_CREDIT_EXIT_RULE } }, sequence: 1 });
    await f.lifecycle.advance(f.game());
    expect(f.lifecycle.getSnapshot().notice).toBe("credits");
    const rejected = fixture();
    rejected.driver.apply.mockReturnValue(false);
    await rejected.lifecycle.advance(rejected.game());
    expect(rejected.driver.step).toHaveBeenCalledOnce();
  });
  it("tracks automatic attempts per version and retains the twelve-step bound", async () => {
    const f = fixture();
    f.driver.step.mockImplementation(async () => ({ result: { game: f.game(), aiDecision: decision }, sequence: 1 }));
    await f.lifecycle.advance(f.game(), true);
    await f.lifecycle.advance(f.game(), true);
    f.reconcile({ ...f.game() });
    await f.lifecycle.advance(f.game(), true);
    expect(f.driver.step).toHaveBeenCalledTimes(12);
    f.reconcile({ ...f.game(), version: 2 });
    await f.lifecycle.advance(f.game(), true);
    expect(f.driver.step).toHaveBeenCalledTimes(24);
  });
  it.each(["BOT_STEP_IN_PROGRESS", "OWNER_AI_LIMIT", "GAME_AI_RATE_LIMIT"])("ignores late %s denial after version advancement", async code => {
    const f = fixture();
    const held = deferred<Awaited<ReturnType<typeof f.driver.step>>>();
    f.driver.step.mockReturnValueOnce(held.promise);
    const loop = f.lifecycle.advance(f.game());
    f.reconcile({ ...initial, version: 2 });
    held.reject(new HttpError("wait", 409, code, 1000));
    await loop;
    expect(f.lifecycle.getSnapshot()).toMatchObject({ kind: "idle", notice: null });
  });
  it("does not advance or retry without ownership", async () => {
    const f = fixture();
    f.reconcile({ ...initial, poker: { ...initial.poker, players: initial.poker.players.map(p => ({ ...p, playerToken: null })) } });
    await f.lifecycle.advance(f.game());
    await f.lifecycle.retry();
    expect(f.driver.step).not.toHaveBeenCalled();
    expect(f.driver.refresh).not.toHaveBeenCalled();
  });
  it("lost-claim refresh failure stays visible without another inference", async () => {
    const f = fixture();
    f.driver.step.mockRejectedValue(new HttpError("lost", 409, "BOT_STEP_CLAIM_LOST"));
    f.driver.refresh.mockRejectedValue(new Error("refresh failed"));
    await f.lifecycle.advance(f.game());
    expect(f.lifecycle.getSnapshot()).toMatchObject({ kind: "paused", notice: "refresh failed" });
    await f.lifecycle.advance(f.game(), true);
    expect(f.driver.step).toHaveBeenCalledOnce();
  });
  it("cleans timers on session disposal and fences automatic attempts by version", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.driver.step.mockRejectedValue(new HttpError("wait", 409, "BOT_STEP_IN_PROGRESS", 1000));
    await f.lifecycle.advance(f.game(), true);
    expect(vi.getTimerCount()).toBe(1);
    f.lifecycle.reset();
    expect(vi.getTimerCount()).toBe(0);
    f.lifecycle.reset("game");
    await f.lifecycle.advance(f.game(), true);
    expect(f.driver.step).toHaveBeenCalledTimes(2);
    f.lifecycle.reset();
  });
});

it("a bot provider pause does not block a different departing-human turn", async () => {
  const f = fixture();
  f.driver.step.mockRejectedValueOnce(new HttpError("provider", 502, "BOT_TIMEOUT"));
  await f.lifecycle.advance(f.game(), true);
  const departing = { ...humanTurn(f.game()), poker: { ...humanTurn(f.game()).poker,
    players: f.game().poker.players.map(player => player.id === "human" ? { ...player, leaving: true } : player) } };
  f.reconcile(departing);
  expect(f.lifecycle.getSnapshot().kind).toBe("idle");
  f.driver.step.mockResolvedValueOnce({ result: { game: { ...departing, status: "complete", version: departing.version + 1 }, aiDecision: decision }, sequence: 2 });
  await f.lifecycle.advance(departing, true);
  expect(f.driver.step).toHaveBeenCalledTimes(2);
});

describe("human timeout scheduling in the shared lifecycle", () => {
  it("schedules expiry once, preserves the decision across unrelated versions and cancels navigation", async () => {
    vi.useFakeTimers({toFake:["setTimeout","clearTimeout","performance"]});
    const { observeTurnClock } = await import("./turn-clock");
    const f = fixture();
    const game = { ...humanTurn(initial), serverTime:"2026-01-01T00:00:00Z", turnTimer:{
      decisionId:"00000000-0000-4000-8000-000000000001", actorEngineId:"human", handNumber:1, deadline:"2026-01-01T00:00:02Z" } };
    observeTurnClock(game);
    f.reconcile(game);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.driver.step).not.toHaveBeenCalled();
    const refreshed = { ...game, version:game.version+1, serverTime:"2026-01-01T00:00:01Z" };
    observeTurnClock(refreshed); f.reconcile(refreshed);
    f.driver.step.mockResolvedValue({result:{game:{...refreshed,version:refreshed.version+1,turnTimer:null},aiDecision:decision},sequence:1});
    await vi.advanceTimersByTimeAsync(1100);
    expect(f.driver.step).toHaveBeenCalledOnce();
    expect(f.driver.step.mock.calls[0][0].version).toBe(refreshed.version);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.driver.step).toHaveBeenCalledOnce();
    observeTurnClock(game); f.reconcile(game); f.lifecycle.reset();
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.driver.step).toHaveBeenCalledOnce();
  });
  it("persistent timeout failures pause across polling without repeatedly issuing requests",async () => {
    vi.useFakeTimers({toFake:["setTimeout","clearTimeout","performance"]});
    const { observeTurnClock } = await import("./turn-clock");
    const f=fixture();
    const game={...humanTurn(initial),serverTime:"2026-01-01T00:00:03Z",turnTimer:{
      decisionId:"00000000-0000-4000-8000-000000000001",actorEngineId:"human",handNumber:1,deadline:"2026-01-01T00:00:02Z"}};
    observeTurnClock(game);f.reconcile(game);
    f.driver.step.mockRejectedValue(new Error("database unavailable"));
    await vi.advanceTimersByTimeAsync(100);
    expect(f.lifecycle.getSnapshot()).toMatchObject({kind:"paused",notice:"database unavailable"});
    for(let version=5;version<10;version++){const refreshed={...game,version};observeTurnClock(refreshed);f.reconcile(refreshed);await vi.advanceTimersByTimeAsync(1000);}
    expect(f.driver.step).toHaveBeenCalledOnce();
    await f.lifecycle.retry();expect(f.driver.step).toHaveBeenCalledTimes(2);
    f.lifecycle.reset();
  });
});

it("waits for the server's remaining interval after an early timeout request",async()=>{
  vi.useFakeTimers({toFake:["setTimeout","clearTimeout","performance"]});
  const {observeTurnClock}=await import("./turn-clock");const f=fixture();
  const game={...humanTurn(initial),serverTime:"2026-01-01T00:00:03Z",turnTimer:{decisionId:"00000000-0000-4000-8000-000000000001",actorEngineId:"human",handNumber:1,deadline:"2026-01-01T00:00:02Z"}};
  observeTurnClock(game);f.reconcile(game);
  f.driver.step.mockRejectedValueOnce(new HttpError("early",409,"TURN_NOT_EXPIRED",500));
  f.driver.step.mockResolvedValue({result:{game:{...game,turnTimer:null},aiDecision:decision},sequence:1});
  await vi.advanceTimersByTimeAsync(100);expect(f.driver.step).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(400);expect(f.driver.step).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(100);expect(f.driver.step).toHaveBeenCalledTimes(2);
  expect(f.lifecycle.getSnapshot().notice).toBeNull();f.lifecycle.reset();
});

it("reconciles unknown outcomes once and pauses the same turn across version changes until explicit retry", async () => {
  const { TransportError } = await import("@/lib/http/api");
  const f = fixture();
  f.driver.step.mockRejectedValueOnce(new TransportError("deadline", "timeout"));
  await f.lifecycle.advance(f.game(), true);
  expect(f.driver.refresh).toHaveBeenCalledOnce();
  expect(f.lifecycle.getSnapshot()).toMatchObject({ kind: "paused", reason: "unknownOutcome" });
  f.reconcile({ ...f.game(), version: 4 });
  await f.lifecycle.advance(f.game(), true);
  expect(f.driver.step).toHaveBeenCalledOnce();
  await f.lifecycle.retry();
  expect(f.driver.step).toHaveBeenCalledTimes(2);
});
it("clears unknown pause when authoritative state proves progression", async () => {
  const { TransportError } = await import("@/lib/http/api");
  const f = fixture();
  f.driver.step.mockRejectedValueOnce(new TransportError("network", "offline"));
  f.driver.refresh.mockImplementationOnce(async () => f.reconcile(humanTurn(f.game())));
  await f.lifecycle.advance(f.game(), true);
  expect(f.lifecycle.getSnapshot()).toMatchObject({ kind: "idle", notice: null });
  expect(f.driver.step).toHaveBeenCalledOnce();
});
it("keeps controls busy while unknown-outcome reconciliation is pending", async () => {
  const { TransportError } = await import("@/lib/http/api");
  const f = fixture(); const held = deferred<void>();
  f.driver.step.mockRejectedValueOnce(new TransportError("deadline", "timeout"));
  f.driver.refresh.mockReturnValueOnce(held.promise);
  const work = f.lifecycle.advance(f.game());
  await vi.waitFor(() => expect(f.lifecycle.getSnapshot().kind).toBe("reconcilingUnknown"));
  await f.lifecycle.retry(); expect(f.driver.step).toHaveBeenCalledOnce();
  held.resolve(); await work;
  expect(f.lifecycle.getSnapshot()).toMatchObject({ kind: "paused", reason: "unknownOutcome" });
});
