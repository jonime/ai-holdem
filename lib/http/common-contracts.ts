import { z } from "zod";
export const gameParamsSchema = z.object({ gameId: z.string().min(1) });
export const versionSchema = z.number().int().nonnegative().safe();
export const versionRequestSchema = z.object({ expectedVersion: versionSchema });
export const errorEnvelopeSchema = z.object({ error: z.string().optional(), code: z.string().optional() });
export type GameParams = z.infer<typeof gameParamsSchema>;
export type VersionRequest = z.infer<typeof versionRequestSchema>;
export type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
