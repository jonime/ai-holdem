import { z } from "zod";

export const legalActionSchema = z.union([
  z.object({ type: z.literal("fold") }),
  z.object({ type: z.literal("check") }),
  z.object({ type: z.literal("call"), amount: z.number().int().nonnegative() }),
  z.object({
    type: z.literal("bet"),
    minAmount: z.number().int().nonnegative(),
    maxAmount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("raise"),
    minAmount: z.number().int().nonnegative(),
    maxAmount: z.number().int().nonnegative(),
  }),
]);

export const publicPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  controller: z.enum(["human", "typesafe_ai"]),
  aiDifficulty: z.enum(["easy", "medium", "hard"]).nullable(),
  seat: z.number().int().nonnegative(),
  status: z.enum(["open", "claimed", "bot"]),
  playerToken: z.string().nullable(),
  isHost: z.boolean(),
  leaving: z.boolean(),
  inHand: z.boolean(),
  stack: z.number().int().nonnegative(),
  folded: z.boolean(),
  allIn: z.boolean(),
  holeCards: z.array(z.string()).nullable(),
});

export const publicGameSchema = z.object({
  handNumber: z.number().int().nonnegative(),
  seatCount: z.number().int().min(2).max(6),
  smallBlind: z.number().int().positive(),
  bigBlind: z.number().int().positive(),
  startingStack: z.number().int().positive(),
  street: z.enum(["preflop", "flop", "turn", "river", "complete"]).nullable(),
  currentActorId: z.string().nullable(),
  communityCards: z.array(z.string()),
  pot: z.number().int().nonnegative(),
  completionReason: z.enum(["fold", "showdown"]).nullable(),
  winnerIds: z.array(z.string()),
  winnerAmounts: z.record(z.string(), z.number().finite()),
  legalActions: z.array(legalActionSchema),
  players: z.array(publicPlayerSchema),
});

export const gameSchema = z.object({
  id: z.string(),
  status: z.enum(["waiting", "playing", "complete", "error"]),
  version: z.number().int().nonnegative(),
  poker: publicGameSchema,
});

export const gameEnvelopeSchema = z.object({ game: gameSchema });

export const handActionHistoryItemSchema = z.object({
  sequence: z.number().int().nonnegative(),
  street: z.string(),
  action: z.string(),
  amount: z.number().nullable(),
  player: z.string(),
  controller: z.enum(["human", "typesafe_ai"]),
});

export const completedAIDecisionInspectionSchema = z.object({
  actionSequence: z.number().int().nonnegative(),
  state: z.unknown(),
  legalActions: z.unknown(),
  choice: z.string(),
  probabilities: z.unknown(),
  confidence: z.number().finite(),
  rawResponse: z.unknown(),
});

export const handHistorySchema = z.object({
  status: z.enum(["playing", "complete", "error"]),
  actions: z.array(handActionHistoryItemSchema),
  aiDecisions: z.array(completedAIDecisionInspectionSchema),
});

export const historyEnvelopeSchema = z.object({ history: handHistorySchema });
