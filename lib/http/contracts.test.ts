import { expect, it } from "vitest";
import { createGameRouteRequestSchema } from "./creation-contracts";
import { claimSeatRouteRequestSchema, seatPathParamsSchema } from "./seat-contracts";
import { feedRouteQuerySchema } from "./feed-contracts";
import { publicationRequestSchema, listingTitleSchema } from "./discovery-contracts";

it("retains creation and claim defaults and ignored optional non-string names", () => {
  expect(createGameRouteRequestSchema.parse(null)).toEqual({ hostName: undefined });
  expect(createGameRouteRequestSchema.parse({ seatCount: 4, hostName: 12 })).toEqual({ seatCount: 4, hostName: undefined });
  expect(claimSeatRouteRequestSchema.parse({ expectedVersion: 1, name: null })).toEqual({ expectedVersion: 1, name: undefined });
});
it.each([["0", 0], ["0x1", 1], ["1e1", 10], [" 2 ", 2], ["", 0], ["1e20", 1e20]])("preserves seat path Number normalization %s", (seat, number) => {
  expect(seatPathParamsSchema.parse({ gameId: "game", seat }).seat).toBe(number);
});
it.each(["-1", "0.1", "NaN", "Infinity"])("rejects invalid seat path %s", seat => {
  expect(seatPathParamsSchema.safeParse({ gameId: "game", seat }).success).toBe(false);
});
it("validates decimal-only feed parsing", () => {
  expect(feedRouteQuerySchema.safeParse({ sinceHand: ["1e2"] }).success).toBe(false);
  expect(feedRouteQuerySchema.parse({ sinceHand: ["0002"] }).sinceHand).toBe(2);
  expect(feedRouteQuerySchema.parse({ sinceHand: [] }).sinceHand).toBeUndefined();
  expect(feedRouteQuerySchema.safeParse({ sinceHand: ["2", "2"] }).success).toBe(false);
  expect(feedRouteQuerySchema.safeParse({ sinceHand: ["2147483648"] }).success).toBe(false);
});
it("retains publication version and trimmed-title validation before service normalization", () => {
  expect(publicationRequestSchema.parse({ expectedVersion: -1, isPublic: true, title: "  Title  " })).toEqual({ expectedVersion: -1, isPublic: true, title: "  Title  " });
  expect(listingTitleSchema.safeParse(`  ${"x".repeat(60)}  `).success).toBe(true);
  expect(listingTitleSchema.safeParse("x".repeat(61)).success).toBe(false);
});
