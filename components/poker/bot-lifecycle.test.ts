import { describe, expect, it } from "vitest";
import { botBusy, botCanRetry, botCanStart, botRetryAfterMs, initialBotLifecycle,
  transitionBotLifecycle as transition, type BotLifecycleState, type BotTurn } from "./bot-lifecycle";

const turn: BotTurn = { gameId: "game", handNumber: 1, actorId: "bot", version: 1 };
const reconcile = (state: BotLifecycleState, changes: Partial<BotTurn> = {}, eligible = true, hasBotTurn = true) =>
  transition(state, { type: "reconcile", turn: { ...turn, ...changes }, eligible, hasBotTurn });

describe("bot lifecycle transition policy", () => {
  it("allows only one advancement or retry refresh", () => {
    const running = transition(initialBotLifecycle, { type: "start", turn });
    expect(botBusy(running)).toBe(true);
    expect(transition(running, { type: "start", turn })).toBe(running);
    expect(transition(running, { type: "retry", turn, now: 0 })).toBe(running);
    const retry = transition(initialBotLifecycle, { type: "retry", turn, now: 0 });
    expect(retry.kind).toBe("refreshingForRetry");
    expect(transition(retry, { type: "start", turn })).toBe(retry);
    expect(transition(retry, { type: "resume", turn }).kind).toBe("running");
    expect(transition(running, { type: "finish" }).kind).toBe("idle");
  });
  it.each(["provider", "retryRefresh"] as const)("retains %s pause across version-only refreshes", reason => {
    const paused = transition(initialBotLifecycle, { type: "pause", turn, reason, notice: "failure" });
    expect(reconcile(paused)).toBe(paused);
    expect(reconcile(paused, { version: 2 })).toBe(paused);
    expect(botCanStart(paused)).toBe(false);
    expect(botCanRetry(paused, 0)).toBe(true);
    for (const change of [{ actorId: "other" }, { handNumber: 2 }, { gameId: "other" }]) {
      expect(reconcile(paused, change).kind).toBe("idle");
    }
  });
  it.each(["claimLost", "claimExpired"] as const)("retains %s until version or turn advancement", reason => {
    const paused = transition(initialBotLifecycle, { type: "pause", turn, reason, notice: "retry" });
    expect(reconcile(paused)).toBe(paused);
    expect(reconcile(paused, { version: 2 })).toEqual(initialBotLifecycle);
  });
  it("claim expiry enables explicit retry without starting work", () => {
    const waiting = transition(initialBotLifecycle, { type: "claimWait", turn, deadline: 90_000 });
    expect(botCanStart(waiting)).toBe(false);
    expect(transition(waiting, { type: "tick", now: 89_999, unfinishedNotice: "retry" })).toBe(waiting);
    const expired = transition(waiting, { type: "tick", now: 90_000, unfinishedNotice: "retry" });
    expect(expired).toMatchObject({ kind: "paused", reason: "claimExpired", notice: "retry", turn });
    expect(botCanStart(expired)).toBe(false);
    expect(reconcile(expired)).toBe(expired);
    expect(reconcile(waiting, { version: 2 })).toEqual(initialBotLifecycle);
  });
  it.each(["OWNER_AI_LIMIT", "GAME_AI_RATE_LIMIT"] as const)("keeps %s deadline until explicit retry", reason => {
    const limited = transition(initialBotLifecycle, { type: "usageLimit", turn, reason, deadline: 60_000, now: 0, notice: "usage" });
    expect(botRetryAfterMs(limited)).toBe(60_000);
    expect(transition(limited, { type: "retry", turn, now: 59_999 })).toBe(limited);
    const expired = transition(limited, { type: "tick", now: 60_000, unfinishedNotice: "retry" });
    expect(botRetryAfterMs(expired)).toBe(0);
    expect(botCanStart(expired)).toBe(false);
    expect(reconcile(expired)).toBe(expired);
    expect(transition(expired, { type: "retry", turn, now: 60_000 }).kind).toBe("refreshingForRetry");
    expect(reconcile(limited, { version: 2 })).toEqual(initialBotLifecycle);
  });
  it("clears waits on completion or lost eligibility and resets every state", () => {
    const waiting = transition(initialBotLifecycle, { type: "claimWait", turn, deadline: 90_000 });
    expect(reconcile(waiting, {}, false)).toEqual(initialBotLifecycle);
    expect(reconcile(waiting, {}, true, false)).toEqual(initialBotLifecycle);
    expect(transition(waiting, { type: "reset" })).toEqual(initialBotLifecycle);
    expect(transition(waiting, { type: "notice", notice: "message" }).notice).toBe("message");
  });
});
