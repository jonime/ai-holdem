import { z } from "zod";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { replayDataSchema } from "./replay-contracts";
import type { Immutable } from "./common-contracts";
export const shareTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const createReplayShareSchema = z.strictObject({ locale: z.enum(SUPPORTED_LOCALES).default("en-US") });
export const titleSchema = z.string().min(1).max(80).refine(value => value === value.trim() && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value));
export const editShareTitleSchema = z.strictObject({ title: titleSchema.nullable(), titleRevision: z.number().int().nonnegative().max(2_147_483_646) });
export const sharedReplaySchema = z.strictObject({ schemaVersion: z.literal(1), replay: replayDataSchema });
export const publicSharedReplaySchema = sharedReplaySchema.extend({ title: titleSchema.nullable().default(null) });
export const activeShareSchema = z.strictObject({ title: titleSchema.nullable().default(null), titleRevision: z.number().int().nonnegative().default(0), token: shareTokenSchema, expiresAt: z.iso.datetime({ offset: true }) });
export const shareManagementSchema = z.strictObject({ share: activeShareSchema.nullable() });
export const revokeShareSchema = z.strictObject({ revoked: z.literal(true) });
export type ReplayData = Immutable<z.infer<typeof replayDataSchema>>;
export type ActiveShare = z.infer<typeof activeShareSchema>;

export const ownedShareSchema = z.strictObject({
  title: titleSchema.nullable().default(null), titleRevision: z.number().int().nonnegative().default(0), token: shareTokenSchema, handNumber: z.number().int().positive(),
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
