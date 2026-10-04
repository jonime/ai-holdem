import { z } from "zod";
import { gameEnvelopeSchema, gameSchema, publicAIDecisionSchema } from "./schemas";

import { versionSchema, type Immutable } from "./common-contracts";
export { gameParamsSchema, type GameParams } from "./common-contracts";
const amountSchema = z.number().int().nonnegative().safe();
export const humanActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fold") }),
  z.object({ type: z.literal("check") }),
  z.object({ type: z.literal("call"), amount: amountSchema.optional() }),
  z.object({ type: z.literal("bet"), amount: amountSchema }),
  z.object({ type: z.literal("raise"), amount: amountSchema }),
]);
export const submitActionRequestSchema = z.object({
  expectedVersion: versionSchema,
  action: humanActionSchema,
});
export const stepBotRequestSchema = submitActionRequestSchema.pick({ expectedVersion: true });
export const getGameResponseSchema = gameEnvelopeSchema;
export const submitActionResponseSchema = gameEnvelopeSchema;
export const stepBotResponseSchema = gameEnvelopeSchema.extend({ aiDecision: publicAIDecisionSchema });
export const GAME_VERSION_CONFLICT = "GAME_VERSION_CONFLICT";

// Public projections are immutable. Input types retain fields defaulted by the
// response parser, so services can retain the existing projection defaults.
export type GameplayGame = Immutable<z.input<typeof gameSchema>>;
export type GameplayAIDecision = Immutable<z.infer<typeof publicAIDecisionSchema>>;
export type HumanAction = z.infer<typeof humanActionSchema>;
export type SubmitActionRequest = z.infer<typeof submitActionRequestSchema>;
export type StepBotRequest = z.infer<typeof stepBotRequestSchema>;
export type GetGameResponse = Immutable<z.infer<typeof getGameResponseSchema>>;
export type SubmitActionResponse = GetGameResponse;
export type StepBotResponse = Immutable<z.infer<typeof stepBotResponseSchema>>;
export type GameResponseEnvelope = Immutable<z.input<typeof getGameResponseSchema>>;
export type BotStepResponseEnvelope = Immutable<z.input<typeof stepBotResponseSchema>>;

export const startRequestSchema = stepBotRequestSchema;
export const nextHandRequestSchema = stepBotRequestSchema;
export const revealRequestSchema = stepBotRequestSchema.extend({ handNumber: versionSchema });
export const seatCountSchema = z.number().int().min(2).max(6);
// Domain constraints and their messages remain in validateTableSettings.
export const tableSettingsSchema = z.object({
  seatCount: z.number(), smallBlind: z.number(), bigBlind: z.number(),
  startingStack: z.number(), botsShowUncontestedWins: z.boolean(),
});
export const settingsRequestSchema = tableSettingsSchema.extend({ expectedVersion: versionSchema });
export const seatCountRequestSchema = stepBotRequestSchema.extend({ seatCount: seatCountSchema });
export const lifecycleResponseSchema = gameEnvelopeSchema;
export type RevealRequest = z.infer<typeof revealRequestSchema>;
export type SettingsRequest = z.infer<typeof settingsRequestSchema>;
export type SeatCountRequest = z.infer<typeof seatCountRequestSchema>;
export type TableSettings = z.infer<typeof tableSettingsSchema>;
