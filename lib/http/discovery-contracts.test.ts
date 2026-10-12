import { expect, it } from "vitest";
import { myGameSummarySchema } from "./discovery-contracts";
const summary = { gameId: "11111111-1111-4111-8111-111111111111", version: 0, removal: "delete", title: null, status: "playing", updatedAt: "2026-10-06T12:00:00Z", occupiedSeats: 3, totalSeats: 6, humanCount: 1, botCount: 2, viewerSeated: true };
it.each([{ humanCount: -1 }, { botCount: -1 }, { humanCount: 1.5 }, { botCount: 0 }, { humanCount: 0, botCount: 3 }, { viewerSeated: "true" }, { occupiedSeats: 7 }, { playerToken: "secret" }, { names: ["Private"] }, { cards: ["As"] }])("rejects invalid or private summary fields %j", overrides => {
  expect(myGameSummarySchema.safeParse({ ...summary, ...overrides }).success).toBe(false);
});
it("accepts owned and unseated assignment snapshots", () => {
  expect(myGameSummarySchema.parse(summary)).toEqual(summary);
  expect(myGameSummarySchema.safeParse({ ...summary, humanCount: 0, botCount: 3, viewerSeated: false }).success).toBe(true);
});
