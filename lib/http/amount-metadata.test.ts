import { expect, it } from "vitest";
import { feedResponseSchema } from "./feed-contracts";
it("accepts per-hand blinds and legacy feed responses and rejects invalid blind metadata", () => {
  const start = { type: "handStarted", handNumber: 1 };
  expect(feedResponseSchema.parse({ feed: { events: [start] } }).feed.events).toEqual([start]);
  const events = [{ ...start, bigBlind: 10 }, { ...start, handNumber: 2, bigBlind: 50 }];
  expect(feedResponseSchema.parse({ feed: { events } }).feed.events).toEqual(events);
  for (const bigBlind of [0, -1, 1.5, null, "10"]) {
    expect(feedResponseSchema.safeParse({ feed: { events: [{ ...start, bigBlind }] } }).success).toBe(false);
  }
});
