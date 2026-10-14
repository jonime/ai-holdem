import type { BotContext, BotDecision, PokerBot } from "@/lib/bots/types";
import { emptyDiagnostics } from "@/lib/bots/types";
import { minimumRiverShare } from "./river-cache";
import { analyzePokerDecision } from "@/lib/poker/decision-facts";
import type { SizingChoice } from "@/lib/typesafe/questions";
import { deriveBoardTexture, analyzePreflopFeatures } from "./frozen/hand-analysis";
import { decideRulesAction as frozenDecision, rulesProfiles, evaluatePressure,
  hashedFrequency, makeSizingChoice } from "./frozen/strategy";
import { decideRulesAction as factsDecision } from "./facts-strategy";

export const POLICY_VERSION = "equity-rules-experiment-v1";
export const variants = ["frozen", "facts", "structured"] as const;
export type Variant = typeof variants[number];

/** No providers, persistence or session adaptation; inputs are privacy-safe decision facts. */
export class ExperimentalRulesBot implements PokerBot {
  constructor(readonly variant: Variant) {}
  async decide(context: BotContext): Promise<BotDecision> {
    const profile = rulesProfiles[context.difficulty];
    if (this.variant === "frozen") return frozenDecision(context, profile);
    if (context.situation?.historyStatus !== "complete" || context.situation.preflop === "unknown") {
      const decision = frozenDecision(context, profile);
      return { ...decision, diagnostics: { ...decision.diagnostics,
        matchedRule: `fallback:${decision.diagnostics.matchedRule}` } };
    }
    if (this.variant === "facts") return factsDecision(context, profile);
    return structuredDecision(context);
  }
}

/** Range experiment passes a separate equity argument; random equity in the DTO stays intact. */
export function structuredDecision(context: BotContext, equity = context.analysis.showdownEquity): BotDecision {
  if (!Number.isFinite(equity) || equity < 0 || equity > 1) throw new Error("Invalid experimental equity");
  const profile = rulesProfiles[context.difficulty];
  const pressure = evaluatePressure(context);
  const check = context.legalActions.find(a => a.type === "check");
  const call = context.legalActions.find(a => a.type === "call");
  const aggressive = context.legalActions.find(a => a.type === "bet" || a.type === "raise");
  const potOdds = call && context.analysis.contestablePotAfterCall > 0
    ? call.amount / context.analysis.contestablePotAfterCall : 0;
  const remaining = context.opponents.filter(o => o.status !== "folded");
  const decision = (action: BotDecision["action"], stage: string): BotDecision => ({
    action, diagnostics: emptyDiagnostics({ matchedRule: `structured:${stage}`, promptVersion: POLICY_VERSION,
      sizing: "amount" in action && (action.type === "bet" || action.type === "raise")
        ? (() => { const option = context.sizingOptions.find(o => o.amount === action.amount);
          return option ? { choice: option.choice, probabilities: null, confidence: null } : null; })() : null }), rawResponse: null,
  });
  // Preserve the frozen exact heads-up river protections before strategy stages.
  if (context.hand.street === "river" && remaining.length === 1) {
    const share = minimumRiverShare(context.hero.holeCards, context.hand.communityCards);
    if (share > 0 && equity <= 0.5 && check) return decision({ type: "check" }, "river-guaranteed-split");
    if (share > 0 && share >= potOdds && call && (!aggressive || equity <= 0.5))
      return decision({ type: "call", amount: call.amount }, "river-unbeatable-call");
  }
  const threshold = profile.valueThreshold + pressure * profile.pressureBias;
  const texture = deriveBoardTexture(context.hand.communityCards);
  const sizing: SizingChoice = texture.label === "wet" ? "full_pot" : texture.label === "neutral" ? "one_half_pot" : "one_third_pot";
  // Preflop strength continues to use random-hand equity; no new charts or range inference.
  if (context.hand.street === "preflop" && aggressive) {
    const potType = context.situation?.preflop ?? "unknown";
    const openingSize: SizingChoice = profile.difficulty === "easy" ? "two_big_blinds"
      : profile.difficulty === "medium" ? "two_and_half_big_blinds" : "three_big_blinds";
    const choice = potType === "unopened" ? openingSize : sizing;
    if (equity >= threshold) return decision(makeSizingChoice(context, aggressive, choice), `preflop-${potType}-value`);
    if (potType === "unopened" && profile.bluffEnabled && aggressive.type === "raise" && pressure < 0.15 &&
        hashedFrequency(context) < 0.15 && analyzePreflopFeatures(context.hero.holeCards).tier === "weak")
      return decision(makeSizingChoice(context, aggressive, choice), "preflop-unopened-bluff");
  }
  const facts = analyzePokerDecision(context);
  if (context.hand.street !== "preflop" && aggressive && !facts.madeHand.boardOnly &&
      facts.madeHand.category !== null && facts.madeHand.category !== "high-card" && equity >= threshold)
    return decision(makeSizingChoice(context, aggressive, sizing), context.hand.street === "river" ? "river-value" : "value");
  if (aggressive && profile.semiBluffEnabled &&
      (context.hand.street === "flop" || context.hand.street === "turn") &&
      remaining.length === 1 && remaining[0].status === "active" && remaining[0].stack > 0 &&
      (facts.draws.flushDrawUsesHoleCards || facts.draws.straightDrawUsesHoleCards) &&
      equity >= 0.34 && hashedFrequency(context) < 0.55)
    return decision(makeSizingChoice(context, aggressive, texture.label === "dry" ? "one_third_pot" : "one_half_pot"), "semi-bluff");
  // Preserve difficulty call margins and pressure adjustments.
  if (call && context.analysis.contestablePotAfterCall > 0 && equity >= potOdds + profile.callThreshold + pressure * 0.05)
    return decision({ type: "call", amount: call.amount }, context.hand.street === "river" ? "river-call" : "passive-call");
  if (check) return decision({ type: "check" }, context.hand.street === "river" ? "river-check" : "passive-check");
  return decision({ type: "fold" }, context.hand.street === "river" ? "river-fold" : "passive-fold");
}
