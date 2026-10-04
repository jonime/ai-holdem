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
  controller: z.enum(["human", "bot"]),
  bot: z
    .object({
      id: z.string(),
      label: z.string(),
      provider: z.enum(["typesafe", "llm", "rules"]),
      modelId: z.string().nullable(),
      configuration: z
        .object({ difficulty: z.boolean(), playstyle: z.boolean() })
        .optional(),
    })
    .nullable()
    .default(null),
  aiDifficulty: z.enum(["easy", "medium", "hard"]).nullable(),
  botProfileId: z
    .enum(["balanced", "tight", "aggressive"])
    .nullable()
    .default(null),
  seat: z.number().int().nonnegative(),
  status: z.enum(["open", "claimed", "bot"]),
  playerToken: z.string().nullable(),
  isHost: z.boolean(),
  leaving: z.boolean(),
  inHand: z.boolean(),
  committedStreet: z.number().int().nonnegative(),
  stack: z.number().int().nonnegative(),
  folded: z.boolean(),
  allIn: z.boolean(),
  bestHand: z
    .enum([
      "high-card",
      "one-pair",
      "two-pair",
      "three-of-a-kind",
      "straight",
      "flush",
      "full-house",
      "four-of-a-kind",
      "straight-flush",
    ])
    .nullable()
    .default(null),
  cardsRevealed: z.boolean().default(false),
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
  botsShowUncontestedWins: z.boolean().default(false),
  legalActions: z.array(legalActionSchema),
  players: z.array(publicPlayerSchema),
});

export const gameSchema = z.object({
  id: z.string(),
  status: z.enum(["waiting", "playing", "complete", "error"]),
  version: z.number().int().nonnegative(),
  viewerIsHost: z.boolean(),
  publication: z
    .object({
      isPublic: z.boolean(),
      title: z.string().max(60).nullable(),
      leaseExpiresAt: z.string(),
    })
    .nullable()
    .default(null),
  poker: publicGameSchema,
});

export const gameEnvelopeSchema = z.object({ game: gameSchema });

export const publicDirectoryEntrySchema = z.object({
  gameId: z.string().uuid(),
  title: z.string().max(60).nullable(),
  version: z.number().int().nonnegative(),
  occupiedSeats: z.number().int().nonnegative(),
  totalSeats: z.number().int().min(2).max(6),
  humanCount: z.number().int().nonnegative(),
  botCount: z.number().int().nonnegative(),
  smallBlind: z.number().int().positive(),
  bigBlind: z.number().int().positive(),
  startingStack: z.number().int().positive(),
  publishedAt: z.string(),
});

export const publicDirectoryEnvelopeSchema = z.object({
  games: z.array(publicDirectoryEntrySchema).max(50),
  nextCursor: z.string().nullable(),
});

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

export const publicAIDecisionSchema = z
  .object({
    action: z.enum(["fold", "check", "call", "bet", "raise"]),
    amount: z.number().int().nonnegative().nullable(),
    bot: z.object({
      id: z.string(),
      label: z.string(),
      provider: z.enum(["typesafe", "llm", "rules"]),
      modelId: z.string().nullable(),
    }),
    botProfileId: z.enum(["balanced", "tight", "aggressive"]).nullable(),
    probabilities: z.record(z.string(), z.number().finite()).nullable(),
    confidence: z.number().finite().nullable(),
    sizing: z
      .object({
        choice: z.enum([
          "two_big_blinds",
          "two_and_half_big_blinds",
          "three_big_blinds",
          "one_third_pot",
          "one_half_pot",
          "two_thirds_pot",
          "full_pot",
          "all_in",
          "not_applicable",
        ]),
        probabilities: z.record(z.string(), z.number().finite()).nullable(),
        confidence: z.number().finite().nullable(),
      })
      .strict()
      .nullable(),
    matchedRule: z.string().nullable(),
  })
  .strict();

const broadcastSeatSchema = z
  .object({
    gameId: z.string(),
    seat: z.number().int().nonnegative(),
    name: z.string().optional(),
    status: z.enum(["open", "claimed", "bot"]),
    controller: z.enum(["human", "bot"]),
    bot: z
      .object({
        id: z.string(),
        label: z.string(),
        provider: z.enum(["typesafe", "llm", "rules"]),
        modelId: z.string().nullable(),
      })
      .nullable()
      .optional(),
    aiDifficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
    playerToken: z.null(),
    isHost: z.boolean(),
    leaving: z.boolean().optional(),
  })
  .strict();

const realtimeEnvelopeBaseSchema = z.object({
  gameId: z.string().min(1),
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
      "cards_revealed",
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
    type: z.enum([
      "seat_claimed",
      "seat_name_updated",
      "seat_released",
      "seat_bot_assigned",
    ]),
    game: broadcastGameSchema,
    seat: broadcastSeatSchema,
  })
  .strict();

const legacyRealtimeGameEventSchema = z.discriminatedUnion("type", [
  gameEventSchema,
  aiDecisionEventSchema,
  seatEventSchema,
]);

// Publishers accept only compact envelopes. Legacy payloads are receive-only.
export const realtimeNotificationSchema = z.union([
  realtimeEnvelopeBaseSchema
    .extend({
      type: z.enum([
        "game_updated",
        "player_action",
        "ai_decision",
        "hand_started",
        "hand_completed",
        "seat_count_updated",
        "table_settings_updated",
        "cards_revealed",
      ]),
    })
    .strict(),
  z.object({
    type: z.enum([
      "seat_claimed",
      "seat_name_updated",
      "seat_released",
      "seat_bot_assigned",
    ]),
    gameId: z.string().min(1),
  }).strict(),
]);

export type RealtimeNotification = z.infer<typeof realtimeNotificationSchema>;

export const realtimeGameEventSchema = z.union([
  realtimeNotificationSchema,
  legacyRealtimeGameEventSchema.transform((event): RealtimeNotification => {
    if ("seat" in event) return { type: event.type, gameId: event.gameId };
    return { type: event.type, gameId: event.gameId, version: event.version };
  }),
]);

export type RealtimeGameEvent = z.infer<typeof realtimeGameEventSchema>;

export const handActionHistoryItemSchema = z.object({
  sequence: z.number().int().nonnegative(),
  street: z.string(),
  action: z.string(),
  amount: z.number().nullable(),
  player: z.string(),
  controller: z.enum(["human", "bot"]),
  bot: z
    .object({
      id: z.string(),
      label: z.string(),
      provider: z.enum(["typesafe", "llm", "rules"]),
      modelId: z.string().nullable(),
    })
    .nullable(),
  botProfileId: z.enum(["balanced", "tight", "aggressive"]).nullable(),
});

export const completedAIDecisionInspectionSchema = z.object({
  actionSequence: z.number().int().nonnegative(),
  state: z.unknown(),
  legalActions: z.unknown(),
  choice: z.string(),
  probabilities: z.unknown(),
  confidence: z.number().finite().nullable(),
  bot: z.object({
    id: z.string(),
    label: z.string(),
    provider: z.enum(["typesafe", "llm", "rules"]),
    modelId: z.string().nullable(),
  }),
  botProfileId: z.enum(["balanced", "tight", "aggressive"]).nullable(),
  matchedRule: z.string().nullable(),
  rawResponse: z.unknown(),
});

export const handHistorySchema = z.object({
  status: z.enum(["playing", "complete", "error"]),
  actions: z.array(handActionHistoryItemSchema),
  aiDecisions: z.array(completedAIDecisionInspectionSchema),
});

export const historyEnvelopeSchema = z.object({ history: handHistorySchema });

const gameFeedEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("handStarted"),
    handNumber: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("street"),
    handNumber: z.number().int().nonnegative(),
    street: z.enum(["preflop", "flop", "turn", "river"]),
    cards: z.array(z.string()),
  }),
  z.object({
    type: z.literal("blind"),
    handNumber: z.number().int().nonnegative(),
    player: z.string(),
    playerId: z.string().nullable(),
    controller: z.enum(["human", "bot"]),
    blind: z.enum(["small", "big"]),
    amount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("action"),
    handNumber: z.number().int().nonnegative(),
    player: z.string(),
    playerId: z.string().nullable(),
    controller: z.enum(["human", "bot"]),
    action: z.enum(["fold", "check", "call", "bet", "raise", "all_in"]),
    amount: z.number().nullable(),
    street: z.enum(["preflop", "flop", "turn", "river"]),
  }),
  z.object({
    type: z.literal("win"),
    handNumber: z.number().int().nonnegative(),
    player: z.string(),
    playerId: z.string().nullable(),
    amount: z.number(),
    uncontested: z.boolean(),
  }),
]);

export const gameFeedSchema = z.object({
  events: z.array(gameFeedEventSchema),
});

export const gameFeedEnvelopeSchema = z.object({ feed: gameFeedSchema });
