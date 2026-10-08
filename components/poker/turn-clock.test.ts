import { describe, expect, it, vi } from "vitest";
import { gameplayGame } from "@/test/fixtures/gameplay";
import { observeTurnClock, turnRemainingMs } from "./turn-clock";
import { hasAutomaticTurn } from "./bot-advancement";

describe("server sampled turn clock", () => {
  it("uses monotonic elapsed time despite local clock jumps and corrects authoritative samples", () => {
    const game = { ...gameplayGame, serverTime: "2026-01-01T00:00:00Z", turnTimer: {
      decisionId: "00000000-0000-4000-8000-000000000001", actorEngineId: "human", handNumber: 1, deadline: "2026-01-01T00:01:00Z" } };
    expect(turnRemainingMs(game,100)).toBeNull();
    observeTurnClock(game,100);
    expect(turnRemainingMs(game,10100)).toBe(50000);
    const date = vi.spyOn(Date,"now").mockReturnValue(0);
    expect(turnRemainingMs(game,20100)).toBe(40000);
    date.mockRestore();
    const refreshed = { ...game, version: game.version+1, serverTime: "2026-01-01T00:00:55Z" };
    observeTurnClock(refreshed,30100);
    expect(turnRemainingMs(refreshed,30100)).toBe(5000);
    expect(turnRemainingMs(refreshed,40100)).toBe(0);
    expect(refreshed.turnTimer.deadline).toBe(game.turnTimer.deadline);
  });
  it("a returned overdue human turn is eligible for the existing automatic loop", () => {
    const game = { ...gameplayGame, serverTime: "2026-01-01T00:02:00Z", turnTimer: {
      decisionId: "00000000-0000-4000-8000-000000000001", actorEngineId: "human", handNumber: 1, deadline: "2026-01-01T00:01:00Z" } };
    observeTurnClock(game);
    expect(hasAutomaticTurn(game)).toBe(true);
    expect(hasAutomaticTurn({ ...game, turnTimer: null })).toBe(false);
  });
});
