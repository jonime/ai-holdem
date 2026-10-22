import { z } from "zod";
import type { Immutable } from "./common-contracts";
export const resultsParamsSchema = z.strictObject({ gameId: z.uuid() });
const count = z.number().int().nonnegative().safe();
const amount = z.number().finite();
const highlight = z.strictObject({ handNumber: count.positive(), netChips: z.number().int().safe(), netBB: amount });
const summary = z.strictObject({
  throughHand: count, handsPlayed: count, availableHands: count, excludedHands: count,
  ownershipIncomplete: z.boolean(), incomplete: z.boolean(),
  netChips: z.number().int().safe().nullable(), netBB: amount.nullable(),
  biggestWin: highlight.nullable(), biggestLoss: highlight.nullable(),
}).superRefine((value, ctx) => {
  const unavailable = value.availableHands === 0 && value.excludedHands > 0;
  if (value.availableHands > value.handsPlayed || value.handsPlayed > value.throughHand ||
      value.excludedHands > value.throughHand || value.incomplete !== (value.excludedHands > 0) ||
      value.ownershipIncomplete && !value.incomplete ||
      (value.netChips === null) !== unavailable || (value.netBB === null) !== unavailable ||
      value.availableHands === 0 && (value.biggestWin !== null || value.biggestLoss !== null) ||
      value.biggestWin && (value.biggestWin.netChips <= 0 || value.biggestWin.netBB <= 0 || value.biggestWin.handNumber > value.throughHand) ||
      value.biggestLoss && (value.biggestLoss.netChips >= 0 || value.biggestLoss.netBB >= 0 || value.biggestLoss.handNumber > value.throughHand)) {
    ctx.addIssue({ code: "custom", message: "Inconsistent results summary" });
  }
});
export const resultsResponseSchema = z.strictObject({ results: summary });
export type PersonalResults = Immutable<z.infer<typeof resultsResponseSchema>>["results"];
