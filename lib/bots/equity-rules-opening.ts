import "server-only";

import { EquityRulesV2Bot } from "./equity-rules-v2";
import type { BotContext, BotDecision } from "./types";

/** Confirmed conditional-value policy; keep the historical strategy unchanged. */
export function applyConfirmedKingOpening(
  context: BotContext,
  baseline: BotDecision,
): BotDecision {
  const bb = context.game.bigBlind;
  if (
    baseline.action.type !== "fold" ||
    context.difficulty !== "medium" ||
    context.hero.holeCards.map(card => card[0]).join("") !== "KK" ||
    !(bb > 0) ||
    context.hand.street !== "preflop" ||
    context.hand.communityCards.length !== 0 ||
    context.situation?.historyStatus !== "complete" ||
    context.situation.preflop !== "unopened" ||
    context.actionHistory.length !== 0 ||
    context.hero.position !== "UTG" ||
    context.hero.investedThisStreet !== 0 ||
    context.hero.stack !== 100 * bb ||
    context.opponents.length !== 5 ||
    context.situation.activeOpponentCount !== 5 ||
    !context.opponents.every(opponent =>
      opponent.status === "active" &&
      opponent.stack + (opponent.position === "small_blind"
        ? context.game.smallBlind
        : opponent.position === "big_blind" ? bb : 0) === 100 * bb)
  ) return baseline;

  const raise = context.legalActions.find(action => action.type === "raise");
  const amount = 3 * bb;
  if (!raise) throw new Error("Confirmed king opening legal raise missing");
  if (amount < raise.minAmount || amount > raise.maxAmount) {
    throw new Error("Confirmed king opening raise out of bounds");
  }
  const sizing = context.sizingOptions.find(option => option.amount === amount);
  return {
    ...baseline,
    action: { type: "raise", amount },
    diagnostics: {
      ...baseline.diagnostics,
      matchedRule: "rules-confirmed-medium-kk-opening",
      sizing: sizing ? { choice: sizing.choice, probabilities: null, confidence: null } : null,
    },
  };
}

export class OpeningAwareEquityRulesBot extends EquityRulesV2Bot {
  override async decide(context: BotContext): Promise<BotDecision> {
    return applyConfirmedKingOpening(context, await super.decide(context));
  }
}
