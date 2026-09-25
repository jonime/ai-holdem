import "server-only";

import type { BotContext, BotDecision, PokerBot } from "./types";
import { emptyDiagnostics } from "./types";
import { EquityRulesStrategy } from "./equity-rules/strategy";

export class EquityRulesV2Bot implements PokerBot {
  private readonly strategy = new EquityRulesStrategy();

  async decide(context: BotContext): Promise<BotDecision> {
    const decision = this.strategy.decide(context);
    const aggressiveAction =
      decision.action.type === "bet" || decision.action.type === "raise"
        ? decision.action
        : null;
    const sizing = aggressiveAction
      ? (context.sizingOptions.find(
          (option) =>
            option.amount !== null && option.amount === aggressiveAction.amount,
        ) ?? null)
      : null;
    return {
      action: decision.action,
      diagnostics: emptyDiagnostics({
        matchedRule: decision.diagnostics.matchedRule,
        sizing: sizing
          ? {
              choice: sizing.choice,
              probabilities: null,
              confidence: null,
            }
          : null,
      }),
      rawResponse: null,
    };
  }
}
