import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleGameEvent, scheduleSeatEvent, scheduleNotification } from "./schedule";

const { afterMock, publish, log } = vi.hoisted(() => ({ afterMock: vi.fn(), publish: vi.fn(), log: vi.fn() }));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("./publish", () => ({ publishNotification: publish, logNotificationFailure: log }));

beforeEach(() => vi.resetAllMocks());
describe("notification scheduling", () => {
  it("captures validated fields and defers one awaited delivery", async () => {
    const input = { type: "player_action" as const, gameId: "game-1", version: 2 };
    scheduleNotification(input);
    input.version = 99;
    expect(publish).not.toHaveBeenCalled();
    const callback = afterMock.mock.calls[0][0];
    let finish!: () => void;
    publish.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    let completed = false;
    const work = callback().then(() => { completed = true; });
    expect(publish).toHaveBeenCalledExactlyOnceWith({ type: "player_action", gameId: "game-1", version: 2 });
    expect(completed).toBe(false);
    finish();
    await work;
  });
  it("contains scheduling failures", () => {
    afterMock.mockImplementation(() => { throw new Error("unavailable"); });
    expect(() => scheduleGameEvent("game-1", "hand_started", 3)).not.toThrow();
    expect(log).toHaveBeenCalledWith("schedule", { type: "hand_started", gameId: "game-1", version: 3 }, expect.any(Number));
  });
  it("contains unexpected publishing failures", async () => {
    publish.mockRejectedValue(new Error("private data"));
    scheduleSeatEvent("game-1", "seat_name_updated");
    await expect(afterMock.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("publish", { type: "seat_name_updated", gameId: "game-1" }, expect.any(Number));
  });
  it("does not schedule invalid fields", () => {
    // @ts-expect-error runtime boundary
    scheduleNotification({ type: "seat_claimed", gameId: "game-1", seat: {} });
    scheduleGameEvent("game-1", "hand_started", -1);
    expect(afterMock).not.toHaveBeenCalled();
  });
});
