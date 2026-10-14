import "server-only";
import { z } from "zod";
import { pokerEngineAdapter } from "@/lib/poker/adapter";

export function parseBotHandContext(data: unknown) {
  const state = z.object({ stateSchemaVersion: z.literal(1), config: z.object({
    smallBlind: z.number().int().positive(), bigBlind: z.number().int().positive(),
    players: z.array(z.object({ id: z.string(), seat: z.number().int().nonnegative(), name: z.string(),
      controller: z.enum(["human", "bot", "typesafe_ai"]), stack: z.number().int().nonnegative(),
      playerToken: z.string().min(1).nullable().optional(), leaving: z.boolean().optional(),
      aiDifficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
      botProfileId: z.enum(["balanced", "tight", "aggressive"]).nullable().optional(),
      bot: z.object({ id: z.string().min(1), label: z.string().min(1), provider: z.enum(["rules", "typesafe", "llm"]),
        modelId: z.string().min(1).nullable() }).strict().nullable().optional() }).passthrough()),
  }).passthrough(), engineState: z.unknown() }).passthrough().transform(raw => pokerEngineAdapter.restore(raw));
  // Empty historical records explicitly mean unknown; malformed nonempty states fail visibly.
  const legacyState = z.union([z.null(), z.object({}).strict().transform(() => null), state]);
  const action = z.discriminatedUnion("type", [
    z.object({ type: z.literal("fold") }), z.object({ type: z.literal("check") }),
    z.object({ type: z.literal("call"), amount: z.number().int().nonnegative().optional() }),
    z.object({ type: z.literal("bet"), amount: z.number().int().nonnegative() }),
    z.object({ type: z.literal("raise"), amount: z.number().int().nonnegative() }),
  ]);
  return z.object({ version: z.number().int().nonnegative(), handNumber: z.number().int().positive(),
    initialState: legacyState, finalState: legacyState.optional(), actions: z.array(z.object({ sequence: z.number().int().positive(),
      action: z.string(), amount: z.number().int().nonnegative().nullable(), stateBefore: legacyState, forcedDeparture: z.boolean().optional(),
    }).transform(row => ({ sequence: row.sequence, stateBefore: row.stateBefore, forcedDeparture: row.forcedDeparture,
      action: row.action === "all_in" ? null : action.parse({ type: row.action, ...(row.amount === null ? {} : { amount: row.amount }) }) }))),
  }).parse(data);
}
