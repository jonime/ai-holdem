import type { BotContext } from "@/lib/bots/types";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { projectBotHistory, legacyDecisionHistory, type BotHandContext } from "@/lib/poker/bot-history";
import type { AIDifficulty, PokerGameState } from "@/lib/poker/types";
import { createPokerAIState } from "./frozen/ai-state";
import { createLegacySizingOptions, createSizingOptions } from "./frozen/questions";
import { calculateShowdownEquity, type ShowdownEquityInput } from "./frozen/equity";
import type { Variant } from "./challenger";

const equityCache = new Map<string, number>();
function cachedEquity(input: ShowdownEquityInput) {
  const key = JSON.stringify(input), cached = equityCache.get(key);
  if (cached !== undefined) return cached;
  const value = calculateShowdownEquity(input);
  if (equityCache.size >= 100_000) equityCache.clear();
  equityCache.set(key, value);
  return value;
}
export function rulesContext(state: PokerGameState, history: BotHandContext | null, variant: Variant,
  difficulty: AIDifficulty, samples = 100): BotContext {
  const actor = engine.snapshot(state).currentActorId;
  if (!actor) throw new Error("Missing actor");
  const projected = projectBotHistory(history, state, actor);
  return rulesContextFromProjection(state, projected, variant, difficulty, samples);
}

/** Match runner supplies incrementally adapter-validated action facts, never provider history. */
export function rulesContextFromProjection(state: PokerGameState,
  projected: ReturnType<typeof projectBotHistory>, variant: Variant, difficulty: AIDifficulty, samples: number): BotContext {
  const actor = engine.snapshot(state).currentActorId;
  if (!actor) throw new Error("Missing actor");
  // Identical stripped history preserves the frozen equity seed and deterministic frequency.
  const corrected = variant !== "frozen" && projected.status === "complete";
  const ai = createPokerAIState(state, actor, { correctedContext: corrected, difficulty, equitySamples: samples, equityCalculator: cachedEquity,
    decisionHistory: legacyDecisionHistory(projected.actions), historyStatus: projected.status });
  return { ...ai, sizingOptions: corrected ? createSizingOptions(ai) : createLegacySizingOptions(ai) };
}
