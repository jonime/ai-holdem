import { z } from "zod";
import { gameParamsSchema, versionRequestSchema } from "./common-contracts";
import { botDescriptorSchema } from "./creation-contracts";
export const seatNumberSchema = z.number().int().nonnegative();
export const seatParamsSchema = gameParamsSchema.extend({ seat: seatNumberSchema });
// Preserve Number(...) + Number.isInteger path normalization; the service checks existence.
const seatPathNumberSchema = z.number().nonnegative().refine(Number.isInteger);
export const seatPathParamsSchema = gameParamsSchema.extend({
  seat: z.string().transform(Number).pipe(seatPathNumberSchema),
});
export const claimSeatRequestSchema = versionRequestSchema.extend({ name: z.string().optional() });
export const claimSeatRouteRequestSchema = z.preprocess(value => {
  const input = value && typeof value === "object" ? value : {};
  return { ...input, name: "name" in input && typeof input.name === "string" ? input.name : undefined };
}, claimSeatRequestSchema);
export const releaseSeatRequestSchema = versionRequestSchema;
export const renameSeatRequestSchema = z.object({ name: z.string() });
export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export const playstyleSchema = z.enum(["balanced", "tight", "aggressive"]);
export const assignBotRequestSchema = versionRequestSchema.extend({
  botId: z.string().optional(), difficulty: difficultySchema.optional(), botProfileId: playstyleSchema.nullable().optional(),
});
// Explicit existing seat response fields; never derive public contracts from row schemas.
export const publicSeatSchema = z.object({
  gameId: z.string(), seat: seatNumberSchema, name: z.string().optional(),
  status: z.enum(["open", "claimed", "bot"]), controller: z.enum(["human", "bot"]),
  bot: botDescriptorSchema.nullable().optional(), aiDifficulty: difficultySchema.nullable().optional(),
  botProfileId: playstyleSchema.nullable().optional(), playerToken: z.string().nullable(),
  isHost: z.boolean(), leaving: z.boolean().optional(), enginePlayerId: z.string().nullable().optional(),
});
export const seatResponseSchema = z.object({ seat: publicSeatSchema });
export type SeatParams = z.infer<typeof seatParamsSchema>;
export type ClaimSeatRequest = z.infer<typeof claimSeatRequestSchema>;
export type RenameSeatRequest = z.infer<typeof renameSeatRequestSchema>;
export type AssignBotRequest = z.infer<typeof assignBotRequestSchema>;
export type SeatResponse = z.infer<typeof seatResponseSchema>;
