import { z } from "zod";
import type { Immutable } from "./common-contracts";
const chips = z.number().int().nonnegative().safe();
const seat = z.number().int().min(0).max(5);
const card = z.string().regex(/^[2-9TJQKA][cdhs]$/);
export const replayParamsSchema = z.strictObject({ gameId: z.uuid(), handNumber: z.coerce.number().int().positive().max(2_147_483_647) });
export const replayOutcomeSchema = z.enum(["REPLAY_MISSING", "REPLAY_UNFINISHED", "REPLAY_UNAVAILABLE"]);
export type ReplayUnavailableCode = z.infer<typeof replayOutcomeSchema>;
export const replayErrorResponseSchema = z.strictObject({ code: replayOutcomeSchema, error: z.string() });
export const replayActionSchema = z.strictObject({
  sequence: z.number().int().positive(), actorSeat: seat,
  type: z.enum(["fold", "check", "call", "bet", "raise"]), amount: chips.nullable(),
});
export const replayFrameSchema = z.strictObject({
  kind: z.enum(["start", "action", "street", "result"]),
  street: z.enum(["preflop", "flop", "turn", "river", "complete"]),
  board: z.array(card).max(5), pot: chips, nextActorSeat: seat.nullable(),
  action: replayActionSchema.nullable(),
  players: z.array(z.strictObject({ seat, stack: chips, bet: chips, folded: z.boolean(), allIn: z.boolean(), cards: z.array(card).length(2).nullable() })).min(2).max(6),
});
export const replayDataSchema = z.strictObject({
  bigBlind: chips.positive().optional(),
  dealerSeat: seat, smallBlindSeat: seat, bigBlindSeat: seat,
  participants: z.array(z.strictObject({ seat, name: z.string().min(1) })).min(2).max(6),
  frames: z.array(replayFrameSchema).min(2),
  pots: z.array(z.strictObject({ amount: chips, awards: z.array(z.strictObject({ seat, amount: chips })) })),
});
export const replayResponseSchema = z.strictObject({ replay: replayDataSchema.extend({ gameId: z.uuid(), handNumber: z.number().int().positive() }) });
export type HandReplay = Immutable<z.infer<typeof replayResponseSchema>>["replay"];
export type ReplayFrame = HandReplay["frames"][number];
