import { expect, it } from "vitest";
import { gameplayGame } from "@/test/fixtures/gameplay";
import { notificationEligible, notificationTurn, observeNotification } from "./turn-notifications";
import { observeTurnClock, turnRemainingMs } from "./turn-clock";
const game = { ...gameplayGame, poker: { ...gameplayGame.poker, currentActorId: "human" } };
it("requires an owned, non-departing human with legal actions and a live deadline", () => {
  expect(notificationEligible(game, "owner", false, true, null)).toBe(true);
  for (const token of [null, "spectator"]) expect(notificationEligible(game, token, false, true, null)).toBe(false);
  expect(notificationEligible(game, "owner", true, true, null)).toBe(false);
  expect(notificationEligible(game, "owner", false, false, null)).toBe(false);
  expect(notificationEligible(game, "owner", false, true, 0)).toBe(false);
  expect(notificationEligible({ ...game, poker: { ...game.poker, legalActions: [] } }, "owner", false, true, null)).toBe(false);
  expect(notificationEligible({ ...game, poker: { ...game.poker, players: game.poker.players.map(p => ({ ...p, leaving: true })) } }, "owner", false, true, null)).toBe(false);
});
it("expires using the server sample and monotonic clock before another response", () => {
  const timed = { ...game, serverTime: "2026-10-10T00:00:00Z", turnTimer: { decisionId: "d1", actorEngineId: "human", handNumber: 1, deadline: "2026-10-10T00:00:01Z" } };
  observeTurnClock(timed, 10);
  expect(notificationEligible(timed, "owner", false, true, turnRemainingMs(timed, 1010))).toBe(false);
});
it("suppresses initial load, refreshes, loading/recovery changes, and unrelated versions", () => {
  const identity = notificationTurn(game)!;
  const first = observeNotification(null, game.id, identity, true, true);
  expect(first.sound).toBe(false);
  expect(notificationTurn({ ...game, version: 99 })).toBe(identity);
  let previous = first.state;
  for (const eligible of [false, true, false, true]) {
    const next = observeNotification(previous, game.id, identity, eligible, true);
    expect(next.sound).toBe(false); previous = next.state;
  }
});
it("detects new decisions and observed actor returns, without catch-up or navigation cues", () => {
  let state = observeNotification(null, "a", "human", true, true).state;
  state = observeNotification(state, "a", "bot", false, true).state;
  expect(observeNotification(state, "a", "human", true, true).sound).toBe(true);
  expect(observeNotification(state, "b", "human", true, true).sound).toBe(false);
  state = observeNotification(state, "a", "bot", false, false).state;
  expect(observeNotification(state, "a", "human", true, true).sound).toBe(false);
  expect(observeNotification(state, "a", "human", true, false).sound).toBe(true);
  expect(notificationTurn({ ...game, turnTimer: { decisionId: "new", actorEngineId: "human", handNumber: 1, deadline: "2026-10-10T00:00:01Z" } })).not.toBe(notificationTurn(game));
});
