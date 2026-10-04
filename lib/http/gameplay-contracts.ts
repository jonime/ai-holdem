import { z } from "zod";
import { gameEnvelopeSchema, gameSchema, publicAIDecisionSchema } from "./schemas";

export const gameParamsSchema = z.object({ gameId: z.string().min(1) });
const amountSchema = z.number().int().nonnegative().safe();
export const humanActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fold") }),
  z.object({ type: z.literal("check") }),
  z.object({ type: z.literal("call"), amount: amountSchema.optional() }),
  z.object({ type: z.literal("bet"), amount: amountSchema }),
  z.object({ type: z.literal("raise"), amount: amountSchema }),
]);
export const submitActionRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative().safe(),
  action: humanActionSchema,
});
export const stepBotRequestSchema = submitActionRequestSchema.pick({ expectedVersion: true });
export const getGameResponseSchema = gameEnvelopeSchema;
export const submitActionResponseSchema = gameEnvelopeSchema;
export const stepBotResponseSchema = gameEnvelopeSchema.extend({ aiDecision: publicAIDecisionSchema });
export const GAME_VERSION_CONFLICT = "GAME_VERSION_CONFLICT";

// Public projections are immutable. Input types retain fields defaulted by the
// response parser, so services can retain the existing projection defaults.
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export type GameplayGame = Immutable<z.input<typeof gameSchema>>;
export type GameplayAIDecision = Immutable<z.infer<typeof publicAIDecisionSchema>>;
export type GameParams = z.infer<typeof gameParamsSchema>;
export type HumanAction = z.infer<typeof humanActionSchema>;
export type SubmitActionRequest = z.infer<typeof submitActionRequestSchema>;
export type StepBotRequest = z.infer<typeof stepBotRequestSchema>;
export type GetGameResponse = Immutable<z.infer<typeof getGameResponseSchema>>;
export type SubmitActionResponse = GetGameResponse;
export type StepBotResponse = Immutable<z.infer<typeof stepBotResponseSchema>>;
export type GameResponseEnvelope = Immutable<z.input<typeof getGameResponseSchema>>;
export type BotStepResponseEnvelope = Immutable<z.input<typeof stepBotResponseSchema>>;
