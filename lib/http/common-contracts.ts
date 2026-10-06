import { z } from "zod";
export const gameParamsSchema = z.object({ gameId: z.string().min(1) });
export const versionSchema = z.number().int().nonnegative().safe();
export const versionRequestSchema = z.object({ expectedVersion: versionSchema });
export const errorEnvelopeSchema = z.object({
  error: z.string().optional(), code: z.string().optional(),
  retryAfterMs: z.number().int().min(1).max(3_600_000).optional(),
}).refine(value => value.code !== "BOT_STEP_IN_PROGRESS" || (value.retryAfterMs !== undefined && value.retryAfterMs <= 90_000))
  .refine(value => !["OWNER_AI_LIMIT", "GAME_AI_RATE_LIMIT", "GAME_CREATION_LIMIT"].includes(value.code ?? "") || value.retryAfterMs !== undefined);
export type GameParams = z.infer<typeof gameParamsSchema>;
export type VersionRequest = z.infer<typeof versionRequestSchema>;
export type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
