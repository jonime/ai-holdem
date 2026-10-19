import { z } from "zod";
import { replayDataSchema } from "./replay-contracts";
import type { Immutable } from "./common-contracts";
export const shareTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const sharedReplaySchema = z.strictObject({ schemaVersion: z.literal(1), replay: replayDataSchema });
export const activeShareSchema = z.strictObject({ token: shareTokenSchema, expiresAt: z.iso.datetime({ offset: true }) });
export const shareManagementSchema = z.strictObject({ share: activeShareSchema.nullable() });
export const revokeShareSchema = z.strictObject({ revoked: z.literal(true) });
export type ReplayData = Immutable<z.infer<typeof replayDataSchema>>;
export type ActiveShare = z.infer<typeof activeShareSchema>;

export const ownedShareSchema = z.strictObject({
  token: shareTokenSchema, handNumber: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }),
});
export const shareCursorSchema = z.strictObject({
  beforeCreatedAt: z.iso.datetime({ offset: true }), beforeToken: shareTokenSchema,
});
export const shareListQuerySchema = shareCursorSchema.partial().refine(
  value => (value.beforeCreatedAt === undefined) === (value.beforeToken === undefined),
);
export const shareListSchema = z.strictObject({ shares: z.array(ownedShareSchema).max(20), nextCursor: shareCursorSchema.nullable() });
export const exactShareParamsSchema = z.strictObject({ token: shareTokenSchema });
export type OwnedShare = z.infer<typeof ownedShareSchema>;
export type ShareList = z.infer<typeof shareListSchema>;
export type ShareListQuery = z.infer<typeof shareListQuerySchema>;
