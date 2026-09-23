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
  dealerSeat: z.number().int().nonnegative().nullable(),
  smallBlindSeat: z.number().int().nonnegative().nullable(),
  bigBlindSeat: z.number().int().nonnegative().nullable(),
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
  viewerIsHost: z.boolean(),
  poker: publicGameSchema,
});

export const gameEnvelopeSchema = z.object({ game: gameSchema });

const broadcastPlayerSchema = publicPlayerSchema
  .extend({
    playerToken: z.null(),
    holeCards: z.null(),
  })
  .strict();

export const broadcastGameSchema = gameSchema
  .extend({
    poker: publicGameSchema
      .extend({
        legalActions: z.array(legalActionSchema).length(0),
        players: z.array(broadcastPlayerSchema),
      })
      .strict(),
  })
  .strict();

const publicAIDecisionSchema = z
  .object({
    action: z.enum(["fold", "check", "call", "bet", "raise"]),
    amount: z.number().int().nonnegative().nullable(),
    probabilities: z.record(z.string(), z.number().finite()),
    confidence: z.number().finite(),
    sizing: z
      .object({
        choice: z.enum([
          "one_third_pot",
          "one_half_pot",
          "two_thirds_pot",
          "full_pot",
          "all_in",
          "not_applicable",
        ]),
        probabilities: z.record(z.string(), z.number().finite()),
        confidence: z.number().finite(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const broadcastSeatSchema = z
  .object({
    gameId: z.string(),
    seat: z.number().int().nonnegative(),
    name: z.string().optional(),
    status: z.enum(["open", "claimed", "bot"]),
    controller: z.enum(["human", "typesafe_ai"]),
    aiDifficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
    playerToken: z.null(),
    isHost: z.boolean(),
    leaving: z.boolean().optional(),
  })
  .strict();

const realtimeEnvelopeBaseSchema = z.object({
  gameId: z.string(),
  version: z.number().int().nonnegative().safe(),
});

const gameEventSchema = realtimeEnvelopeBaseSchema
  .extend({
    type: z.enum([
      "game_updated",
      "player_action",
      "hand_started",
      "hand_completed",
      "seat_count_updated",
      "table_settings_updated",
    ]),
    game: broadcastGameSchema,
  })
  .strict();

const aiDecisionEventSchema = realtimeEnvelopeBaseSchema
  .extend({
    type: z.literal("ai_decision"),
    game: broadcastGameSchema,
    aiDecision: publicAIDecisionSchema,
  })
  .strict();

const seatEventSchema = realtimeEnvelopeBaseSchema
  .extend({
    type: z.enum(["seat_claimed", "seat_released", "seat_bot_assigned"]),
    game: broadcastGameSchema,
    seat: broadcastSeatSchema,
  })
  .strict();

export const realtimeGameEventSchema = z.discriminatedUnion("type", [
  gameEventSchema,
  aiDecisionEventSchema,
  seatEventSchema,
]);

export type RealtimeGameEvent = z.infer<typeof realtimeGameEventSchema>;

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
