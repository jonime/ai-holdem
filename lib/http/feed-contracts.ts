import { z } from "zod";
import { versionSchema, type Immutable } from "./common-contracts";
import { gameFeedSchema, gameFeedEnvelopeSchema } from "./schemas";
const feedHandNumberSchema = versionSchema.max(2_147_483_647);
export const feedQuerySchema = z.object({ sinceHand: feedHandNumberSchema.optional() });
export const feedRouteQuerySchema = z.object({
  sinceHand: z.array(z.string()).max(1)
    .transform((values): string | undefined => values[0])
    .pipe(z.string().regex(/^[0-9]+$/).transform(Number).pipe(feedHandNumberSchema).optional()),
});
export const feedResponseSchema = gameFeedEnvelopeSchema;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type GameFeed = Immutable<z.infer<typeof gameFeedSchema>>;
export type GameFeedEvent = GameFeed["events"][number];
export type FeedResponse = Immutable<z.infer<typeof feedResponseSchema>>;
