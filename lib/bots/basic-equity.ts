import type { LegalAction, PokerAction } from "@/lib/poker/types";

import { emptyDiagnostics, type BotContext, type BotDecision, type PokerBot } from "./types";

function passiveAction(context: BotContext): { action: PokerAction; rule: string } {
  const check = context.legalActions.find((action) => action.type === "check");
  if (check) return { action: check, rule: "check-below-value-threshold" };

  const call = context.legalActions.find((action) => action.type === "call");
  if (
    call?.type === "call" &&
    context.analysis.showdownEquity >= context.analysis.potOddsToCall + 0.05
  ) {
    return {
      action: { type: "call", amount: call.amount },
      rule: "call-equity-meets-pot-odds-plus-five-points",
    };
  }
  return { action: { type: "fold" }, rule: "fold-insufficient-call-equity" };
}

function aggressiveAction(context: BotContext): { action: PokerAction; rule: string } | null {
  if (context.analysis.showdownEquity < 0.7) return null;
  const aggressive = context.legalActions.find(
    (action): action is Extract<LegalAction, { type: "bet" | "raise" }> =>
      action.type === "bet" || action.type === "raise",
  );
  if (!aggressive) return null;
  const candidates = context.sizingOptions.filter(
    (option): option is typeof option & { amount: number } => option.amount !== null,
  );
  const halfPotTarget =
    aggressive.type === "raise"
      ? context.hero.investedThisStreet +
        context.hero.amountToCall +
        Math.round((context.hand.pot + context.hero.amountToCall) / 2)
      : context.hero.investedThisStreet + Math.round(context.hand.pot / 2);
  const selected = [...candidates].sort(
    (left, right) =>
      Math.abs(left.amount - halfPotTarget) -
        Math.abs(right.amount - halfPotTarget) || left.amount - right.amount,
  )[0];
  if (!selected) return null;
  return {
    action: { type: aggressive.type, amount: selected.amount },
    rule: "value-bet-equity-at-least-seventy-percent-half-pot",
  };
}

export class BasicEquityBot implements PokerBot {
  async decide(context: BotContext): Promise<BotDecision> {
    const selected = aggressiveAction(context) ?? passiveAction(context);
    return {
      action: selected.action,
      diagnostics: emptyDiagnostics({ matchedRule: selected.rule }),
      rawResponse: null,
    };
  }
}
