import type { LegalAction } from "@/lib/poker/types";
import type { SizingChoice } from "@/lib/typesafe/questions";

import type { BotContext, BotDecision } from "../types";
import { emptyDiagnostics } from "../types";
import {
  analyzePreflopFeatures,
  deriveBoardTexture,
  evaluateMadeHand,
  summarizeDraws,
} from "./hand-analysis";

export type RulesProfile = {
  readonly difficulty: "easy" | "medium" | "hard";
  readonly valueThreshold: number;
  readonly callThreshold: number;
  readonly pressureBias: number;
  readonly bluffEnabled: boolean;
  readonly semiBluffEnabled: boolean;
  readonly sizingBias: number;
};

export const rulesProfiles: Record<RulesProfile["difficulty"], RulesProfile> = {
  easy: {
    difficulty: "easy",
    valueThreshold: 0.7,
    callThreshold: 0.08,
    pressureBias: 0.02,
    bluffEnabled: false,
    semiBluffEnabled: false,
    sizingBias: 0.1,
  },
  medium: {
    difficulty: "medium",
    valueThreshold: 0.62,
    callThreshold: 0.05,
    pressureBias: 0.04,
    bluffEnabled: false,
    semiBluffEnabled: true,
    sizingBias: 0.18,
  },
  hard: {
    difficulty: "hard",
    valueThreshold: 0.56,
    callThreshold: 0.0,
    pressureBias: 0.08,
    bluffEnabled: true,
    semiBluffEnabled: true,
    sizingBias: 0.25,
  },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pickLegalAction(
  context: BotContext,
  type: "bet" | "raise" | "check" | "call" | "fold",
) {
  return context.legalActions.find((action) => action.type === type) ?? null;
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashedFrequency(context: BotContext): number {
  const seed = JSON.stringify({
    handNumber: context.game.handNumber,
    hero: context.hero.holeCards,
    board: context.hand.communityCards,
    street: context.hand.street,
    history: context.actionHistory,
  });
  return (stableHash(seed) % 1000) / 1000;
}

function makeSizingChoice(
  context: BotContext,
  legal: Extract<LegalAction, { type: "bet" | "raise" }>,
  preferred: SizingChoice,
): { type: "bet" | "raise"; amount: number } {
  const options = [...context.sizingOptions].filter(
    (option): option is typeof option & { amount: number } =>
      option.amount !== null,
  );
  const matching = options.find((option) => option.choice === preferred);
  const fallback = options.find((option) => option.amount !== null);
  const amount = matching?.amount ?? fallback?.amount ?? legal.minAmount;
  return {
    type: legal.type,
    amount: clamp(amount, legal.minAmount, legal.maxAmount),
  };
}

function evaluatePressure(context: BotContext): number {
  return context.opponents.reduce((total, opponent) => {
    const actionPressure = context.actionHistory.filter(
      (item) => item.actorSeat === opponent.seat || item.controller === "bot",
    ).length;
    return total + actionPressure * 0.04;
  }, 0);
}

export function decideRulesAction(
  context: BotContext,
  profile: RulesProfile,
): BotDecision {
  const legalCheck = pickLegalAction(context, "check");
  const legalFold = pickLegalAction(context, "fold");
  const legalCall = pickLegalAction(context, "call");
  const legalAggressive = context.legalActions.find(
    (action): action is Extract<LegalAction, { type: "bet" | "raise" }> =>
      action.type === "bet" || action.type === "raise",
  );

  const pressure = evaluatePressure(context);
  const boardTexture = deriveBoardTexture(context.hand.communityCards);
  const preflop =
    context.hand.street === "preflop"
      ? analyzePreflopFeatures(context.hero.holeCards)
      : null;
  const heroMade = evaluateMadeHand(
    context.hero.holeCards,
    context.hand.communityCards,
  );
  const draws = summarizeDraws(
    context.hero.holeCards,
    context.hand.communityCards,
  );
  const equity = context.analysis.showdownEquity;

  const adjustedValueThreshold =
    profile.valueThreshold + pressure * profile.pressureBias;
  const callThreshold = profile.callThreshold + pressure * 0.02;

  if (legalCheck && equity < 0.15 && !legalAggressive) {
    return {
      action: { type: "check" },
      diagnostics: emptyDiagnostics({ matchedRule: "rules-check-safe" }),
      rawResponse: null,
    };
  }

  if (legalAggressive) {
    const valueBias =
      (heroMade.category ? 0.18 : 0) +
      (draws.flushDraw || draws.straightDraw ? 0.08 : 0) +
      (boardTexture.label === "wet" ? 0.1 : 0) +
      (context.hand.street === "turn" ? 0.05 : 0) +
      (profile.difficulty === "hard" ? 0.04 : 0);

    if (
      equity >= 0.6 ||
      equity >= adjustedValueThreshold + valueBias ||
      (heroMade.category && heroMade.category !== "high-card" && equity >= 0.42)
    ) {
      const sizingChoice =
        boardTexture.label === "wet"
          ? "full_pot"
          : boardTexture.label === "neutral"
            ? "one_half_pot"
            : "one_third_pot";
      return {
        action: makeSizingChoice(context, legalAggressive, sizingChoice),
        diagnostics: emptyDiagnostics({ matchedRule: "rules-value-bet" }),
        rawResponse: null,
      };
    }

    if (
      profile.semiBluffEnabled &&
      (draws.flushDraw || draws.straightDraw) &&
      equity >= 0.34 &&
      hashedFrequency(context) < 0.55
    ) {
      const sizingChoice =
        boardTexture.label === "dry" ? "one_third_pot" : "one_half_pot";
      return {
        action: makeSizingChoice(context, legalAggressive, sizingChoice),
        diagnostics: emptyDiagnostics({ matchedRule: "rules-semi-bluff" }),
        rawResponse: null,
      };
    }

    if (
      profile.bluffEnabled &&
      context.hand.street === "preflop" &&
      !context.actionHistory.length &&
      legalAggressive.type === "raise" &&
      pressure < 0.15 &&
      hashedFrequency(context) < 0.15 &&
      preflop?.tier === "weak"
    ) {
      return {
        action: makeSizingChoice(context, legalAggressive, "one_third_pot"),
        diagnostics: emptyDiagnostics({ matchedRule: "rules-pure-bluff" }),
        rawResponse: null,
      };
    }
  }

  if (
    legalCall &&
    legalCall.type === "call" &&
    context.analysis.potOddsToCall > 0
  ) {
    const callRequired =
      context.analysis.potOddsToCall + callThreshold + pressure * 0.03;
    if (equity >= callRequired) {
      return {
        action: { type: "call", amount: legalCall.amount },
        diagnostics: emptyDiagnostics({ matchedRule: "rules-call" }),
        rawResponse: null,
      };
    }
  }

  if (legalCheck) {
    return {
      action: { type: "check" },
      diagnostics: emptyDiagnostics({ matchedRule: "rules-check" }),
      rawResponse: null,
    };
  }

  if (legalFold) {
    return {
      action: { type: "fold" },
      diagnostics: emptyDiagnostics({ matchedRule: "rules-fold" }),
      rawResponse: null,
    };
  }

  return {
    action: { type: "fold" },
    diagnostics: emptyDiagnostics({ matchedRule: "rules-default-fold" }),
    rawResponse: null,
  };
}

export class EquityRulesStrategy {
  decide(context: BotContext): BotDecision {
    const profile = rulesProfiles[context.difficulty] ?? rulesProfiles.medium;
    return decideRulesAction(context, profile);
  }
}
