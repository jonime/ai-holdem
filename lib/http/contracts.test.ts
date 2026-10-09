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

it("legacy broadcasts cannot carry private live-seat ownership tokens", async () => {
  const { broadcastGameSchema } = await import("./schemas");
  const { gameplayGame } = await import("@/test/fixtures/gameplay");
  const publicGame = { ...gameplayGame, publication: null, poker: { ...gameplayGame.poker, legalActions: [],
    players: gameplayGame.poker.players.map(player => ({ ...player, playerToken: null, holeCards: null })),
    seats: [{ id: "human", seat: 0, status: "claimed", controller: "human", stack: 1000, leaving: false, playerToken: "private-owner" }],
  } };
  expect(broadcastGameSchema.safeParse(publicGame).success).toBe(false);
  expect(broadcastGameSchema.safeParse({ ...publicGame, poker: { ...publicGame.poker,
    seats: publicGame.poker.seats.map(seat => ({ ...seat, playerToken: null })),
  } }).success).toBe(true);
});


it("defaults legacy winning hands to null and validates exactly five distinct card identifiers", async () => {
  const { publicPlayerSchema } = await import("./schemas");
  const { gameplayGame } = await import("@/test/fixtures/gameplay");
  const player = gameplayGame.poker.players[0];
  expect(publicPlayerSchema.parse(player).winningHand).toBeNull();
  expect(publicPlayerSchema.parse({ ...player, winningHand: null }).winningHand).toBeNull();
  const winningHand = { cards: ["As", "Kd", "Qh", "Jc", "Ts"], playsBoard: false };
  expect(publicPlayerSchema.parse({ ...player, winningHand }).winningHand).toEqual(winningHand);
  for (const invalid of [
    { ...winningHand, cards: ["As"] },
    { ...winningHand, cards: [...winningHand.cards, "2c"] },
    { ...winningHand, cards: ["As", "Kd", "Qh", "Jc", "10s"] },
    { ...winningHand, cards: ["As", "Kd", "Qh", "Jc", "Tx"] },
    { ...winningHand, cards: ["As", "As", "Qh", "Jc", "Ts"] },
    { cards: winningHand.cards },
    { ...winningHand, playsBoard: "false" },
    { ...winningHand, rank: 8 },
  ]) expect(publicPlayerSchema.safeParse({ ...player, winningHand: invalid }).success).toBe(false);
});
