import "server-only";
import type { BotContext } from "@/lib/bots/types";
import { createSizingOptions } from "@/lib/typesafe/questions";
import { decisionCandidates } from "./decision-candidates";
import { analyzePokerDecision } from "./decision-facts";

/** Shared Jev/LLM payment arithmetic, facts, and exact candidates. */
export function prepareProviderContext(context: BotContext): BotContext {
  const call = context.legalActions.find(a => a.type === "call");
  const callCost = call?.type === "call" ? call.amount : 0;
  const pot = context.analysis.livePot ?? context.hand.pot;
  const corrected: BotContext = {
    ...context,
    hand: { ...context.hand, pot },
    hero: { ...context.hero, amountToCall: callCost },
    analysis: { ...context.analysis, callCost,
      potOddsToCall: context.analysis.contestablePotAfterCall > 0 ? callCost / context.analysis.contestablePotAfterCall : 0,
      stackToPotRatio: pot > 0 ? context.analysis.effectiveStack / pot : 0 },
    legalActions: decisionCandidates(context),
  };
  return { ...corrected, facts: analyzePokerDecision(corrected), sizingOptions: createSizingOptions(corrected) };
}
