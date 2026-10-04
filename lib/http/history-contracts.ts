import { z } from "zod";
import { versionSchema, type Immutable } from "./common-contracts";
import { handActionHistoryItemSchema, completedAIDecisionInspectionSchema, handHistorySchema, historyEnvelopeSchema, gameFeedSchema, gameFeedEnvelopeSchema } from "./schemas";
export const historyQuerySchema = z.object({ hand: z.number().int().positive().safe() });
// Number(null) and the first repeated hand value retain the history route's parsing.
export const historyRouteQuerySchema = z.object({ hand: z.string().nullable().transform(Number).pipe(historyQuerySchema.shape.hand) });
const feedHandNumberSchema = versionSchema.max(2_147_483_647);
export const feedQuerySchema = z.object({ sinceHand: feedHandNumberSchema.optional() });
export const feedRouteQuerySchema = z.object({
  sinceHand: z.array(z.string()).max(1)
    .transform((values): string | undefined => values[0])
    .pipe(z.string().regex(/^[0-9]+$/).transform(Number).pipe(feedHandNumberSchema).optional()),
});
export const historyResponseSchema = historyEnvelopeSchema;
export const feedResponseSchema = gameFeedEnvelopeSchema;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type HandActionHistoryItem = Immutable<z.infer<typeof handActionHistoryItemSchema>>;
export type CompletedAIDecisionInspection = Immutable<z.infer<typeof completedAIDecisionInspectionSchema>>;
export type HandHistory = Immutable<z.infer<typeof handHistorySchema>>;
export type GameFeed = Immutable<z.infer<typeof gameFeedSchema>>;
export type GameFeedEvent = GameFeed["events"][number];
export type HistoryResponse = Immutable<z.infer<typeof historyResponseSchema>>;
export type FeedResponse = Immutable<z.infer<typeof feedResponseSchema>>;
