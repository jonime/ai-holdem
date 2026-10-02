import { describe, expect, it, vi } from "vitest";
import { FeedSynchronizer, mergeGameFeed } from "./feed-synchronizer";
import type { GameFeed } from "./types";

const feed = (...hands: number[]): GameFeed => ({
  events: hands.map(handNumber => ({ type: "handStarted", handNumber })),
});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function deferred() {
  let resolve!: (value: GameFeed) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<GameFeed>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("mergeGameFeed", () => {
  it("replaces the changing range, preserving completed history and winnings", () => {
    const incoming: GameFeed = { events: [
      ...feed(2).events,
      { type: "win", handNumber: 2, player: "Winner", playerId: "p", amount: 100, uncontested: true },
      ...feed(3, 4).events,
    ] };
    const merged = mergeGameFeed(feed(1, 2), incoming, 2);
    expect(merged.events).toEqual([...feed(1).events, ...incoming.events]);
    expect(mergeGameFeed(merged, incoming, 2)).toEqual(merged);
  });
  it("replaces on full loads, handles empty results, and bounds distinct hands", () => {
    expect(mergeGameFeed(feed(1), feed())).toEqual(feed());
    expect(mergeGameFeed(feed(1, 2), feed(), 2)).toEqual(feed(1));
    const merged = mergeGameFeed(feed(...Array.from({ length: 50 }, (_, i) => i + 1)), feed(50, 51, 52), 50);
    expect(merged).toEqual(feed(...Array.from({ length: 50 }, (_, i) => i + 3)));
  });
});

describe("FeedSynchronizer", () => {
  it("loads once, skips covered versions, and requests only the inclusive changing range", async () => {
    const load = vi.fn().mockResolvedValueOnce(feed(1, 2)).mockResolvedValueOnce(feed(2, 3, 4));
    const update = vi.fn();
    const reader = new FeedSynchronizer(load, update);
    reader.refresh(1);
    await tick();
    reader.refresh(1);
    reader.refresh(4);
    await tick();
    expect(load.mock.calls.map(call => call[0])).toEqual([undefined, 2]);
    expect(update).toHaveBeenLastCalledWith(feed(1, 2, 3, 4));
    reader.dispose();
  });
  it("serializes and coalesces in-flight updates", async () => {
    const first = deferred();
    const second = deferred();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const reader = new FeedSynchronizer(load, vi.fn());
    reader.refresh(1);
    reader.refresh(2);
    reader.refresh(3);
    expect(load).toHaveBeenCalledTimes(1);
    first.resolve(feed(1));
    await tick();
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1][0]).toBe(1);
    second.resolve(feed(1, 2));
    await tick();
    reader.refresh(3);
    expect(load).toHaveBeenCalledTimes(2);
    reader.dispose();
  });
  it("retains cached history after failure and retries an unchanged version", async () => {
    const load = vi.fn().mockResolvedValueOnce(feed(1)).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(feed(1, 2));
    const update = vi.fn();
    const reader = new FeedSynchronizer(load, update);
    reader.refresh(1);
    await tick();
    reader.refresh(2);
    await tick();
    expect(update).toHaveBeenCalledTimes(1);
    reader.refresh(2);
    await tick();
    expect(load.mock.calls.map(call => call[0])).toEqual([undefined, 1, 1]);
    expect(update).toHaveBeenLastCalledWith(feed(1, 2));
    reader.dispose();
  });
  it("keeps full loading after an empty feed and failed initial load", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(feed()).mockResolvedValueOnce(feed(1));
    const reader = new FeedSynchronizer(load, vi.fn());
    reader.refresh(0); await tick();
    reader.refresh(0); await tick();
    reader.refresh(1); await tick();
    expect(load.mock.calls.map(call => call[0])).toEqual([undefined, undefined, undefined]);
    reader.dispose();
  });
  it("aborts navigation requests and ignores late responses", async () => {
    const pending = deferred();
    const load = vi.fn().mockReturnValue(pending.promise);
    const update = vi.fn();
    const reader = new FeedSynchronizer(load, update);
    reader.refresh(1);
    reader.dispose();
    expect(load.mock.calls[0][1].aborted).toBe(true);
    pending.resolve(feed(1));
    await tick();
    reader.refresh(2);
    expect(update).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
    const nextLoad = vi.fn().mockResolvedValue(feed(5));
    const next = new FeedSynchronizer(nextLoad, update);
    next.refresh(1); await tick();
    expect(nextLoad.mock.calls[0][0]).toBeUndefined();
    next.dispose();
  });
});
