import { z } from "zod";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { seatCountSchema } from "./gameplay-contracts";
import { humanTurnSecondsSchema, botDescriptorSchema } from "./schemas";
export { botDescriptorSchema } from "./schemas";
export const creationAttemptIdSchema = z.string().uuid();
export const quickPlayRequestSchema = z.object({ creationAttemptId: creationAttemptIdSchema.optional(), hostName: z.string().optional() });
export const createGameRequestSchema = z.object({ creationAttemptId: creationAttemptIdSchema.optional(), humanTurnSeconds: humanTurnSecondsSchema.optional(), seatCount: seatCountSchema.optional(), hostName: z.string().optional() });
// Creation historically ignores non-string names and accepts an absent/malformed body.
export const createGameRouteRequestSchema = z.preprocess(value => {
  const input = value && typeof value === "object" ? value : {};
  return { ...input, hostName: "hostName" in input && typeof input.hostName === "string" ? input.hostName : undefined };
}, createGameRequestSchema);
export const createGameResponseSchema = z.object({ gameId: z.string().regex(/^[a-zA-Z0-9-]+$/) });
export const quickPlayParamsSchema = z.object({ lang: z.enum(SUPPORTED_LOCALES), botMode: z.literal("rules").optional(), creationAttemptId: creationAttemptIdSchema.optional(), hostName: z.string().optional() });
export const quickPlayResponseSchema = z.object({ gameId: z.string().regex(/^[a-zA-Z0-9-]+$/) });
export const botCatalogResponseSchema = z.object({ bots: z.array(botDescriptorSchema) });
export type CreateGameRequest = z.infer<typeof createGameRequestSchema>;
export type CreateGameResponse = z.infer<typeof createGameResponseSchema>;
export type QuickPlayParams = z.infer<typeof quickPlayParamsSchema>;
export type BotDescriptor = z.infer<typeof botDescriptorSchema>;
