import { afterEach, expect, it, vi } from "vitest";
import { withDeadline, TransportError } from "./deadline";
import { api } from "./api";
import { gameplayGame as game } from "@/test/fixtures/gameplay";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each(["headers", "body"])("bounds stalled %s without resubmitting", async phase => {
  vi.useFakeTimers();
  const stalled = new Promise<never>(() => {});
  const fetch = vi.fn().mockReturnValue(phase === "headers" ? stalled : Promise.resolve({ ok: true, json: () => stalled }));
  vi.stubGlobal("fetch", fetch);
  const result = api.games.submitAction({ gameId: "game", expectedVersion: 1, action: { type: "fold" } });
  const assertion = expect(result).rejects.toMatchObject({ kind: "deadline" });
  await vi.advanceTimersByTimeAsync(15_000);
  await assertion;
  expect(fetch).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("cleans up caller listeners and timers on success", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  await expect(withDeadline(async () => 42, 15_000, controller.signal)).resolves.toBe(42);
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});
it("classifies caller cancellation separately, including a pre-aborted caller", async () => {
  const controller = new AbortController();
  const result = withDeadline(() => new Promise(() => {}), 15_000, controller.signal);
  controller.abort();
  await expect(result).rejects.toMatchObject({ kind: "cancelled", name: "AbortError" });
  const run = vi.fn();
  await expect(withDeadline(run, 15_000, controller.signal)).rejects.toMatchObject({ kind: "cancelled" });
  expect(run).not.toHaveBeenCalled();
});
it("distinguishes network failure from invalid success and HTTP rejection", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(api.games.reveal({ gameId: "game", expectedVersion: 1, handNumber: 1 })).rejects.toEqual(new TransportError("network", "offline"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ game: {} })));
  await expect(api.games.start({ gameId: "game", expectedVersion: 1 })).rejects.toMatchObject({ kind: "invalidResponse" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ game })));
  await expect(api.games.start({ gameId: "game", expectedVersion: 1 })).resolves.toHaveProperty("game");
});
it("classifies a body disconnection as a network failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new TypeError("terminated"); } }));
  await expect(api.games.start({ gameId: "game", expectedVersion: 1 })).rejects.toMatchObject({ kind: "network" });
});
it("gives bot steps 100 seconds while seat mutations receive 15", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const bot = api.games.stepBot({ gameId: "game", expectedVersion: 1 });
  const seat = api.seats.release({ gameId: "game", seat: 0, expectedVersion: 1 });
  const botAssertion = expect(bot).rejects.toMatchObject({ kind: "deadline" });
  const seatAssertion = expect(seat).rejects.toMatchObject({ kind: "deadline" });
  await vi.advanceTimersByTimeAsync(15_000); await seatAssertion;
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(85_000); await botAssertion;
});
