import type { PokerAIState } from "@/lib/poker/ai-state";
import type { LegalAction } from "@/lib/poker/types";

import type { ChoiceQuestion, SystemOneRequest } from "./types";

export type SizingChoice =
  | "one_third_pot"
  | "one_half_pot"
  | "two_thirds_pot"
  | "full_pot"
  | "all_in"
  | "not_applicable";

export interface SizingOption {
  readonly choice: SizingChoice;
  readonly amount: number | null;
  readonly description: string;
}

export function createActionCriteria(
  legalActions: readonly LegalAction[],
): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const action of legalActions) {
    if (action.type === "fold")
      criteria.fold =
        "Fold only when continuing has negative chip EV against the opponents' likely ranges. Never fold when checking is available.";
    if (action.type === "check")
      criteria.check =
        "Take the free card or showdown when betting would not gain enough value or fold equity; also use checks to protect the checking range.";
    if (action.type === "call")
      criteria.call =
        "Continue when equity and future value justify the pot odds, especially with bluff catchers or draws that should not raise.";
    if (action.type === "bet")
      criteria.bet =
        "Bet for value when worse hands can continue, or bluff/semi-bluff when blockers, board texture, and fold equity make it profitable.";
    if (action.type === "raise")
      criteria.raise =
        "Raise for value against hands that can continue, or as a selective bluff/semi-bluff with sufficient fold equity and suitable blockers.";
  }
  return criteria;
}

function clamp(amount: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, amount));
}

export function createSizingOptions(state: PokerAIState): readonly SizingOption[] {
  const action = state.legalActions.find(
    (candidate) => candidate.type === "bet" || candidate.type === "raise",
  );
  if (!action || (action.type !== "bet" && action.type !== "raise")) {
    return [
      {
        choice: "not_applicable",
        amount: null,
        description: "No bet or raise is available; this answer is ignored.",
      },
    ];
  }

  const potAfterCall = state.hand.pot + state.hero.amountToCall;
  const matchedCommitment =
    state.hero.investedThisStreet + state.hero.amountToCall;
  const fractions = [
    ["one_third_pot", 1 / 3, "one third"] as const,
    ["one_half_pot", 1 / 2, "one half"] as const,
    ["two_thirds_pot", 2 / 3, "two thirds"] as const,
    ["full_pot", 1, "the full pot"] as const,
  ];
  const byAmount = new Map<number, SizingOption>();

  for (const [choice, fraction, label] of fractions) {
    const desired =
      action.type === "bet"
        ? state.hero.investedThisStreet + Math.round(state.hand.pot * fraction)
        : matchedCommitment + Math.round(potAfterCall * fraction);
    const amount = clamp(desired, action.minAmount, action.maxAmount);
    if (!byAmount.has(amount)) {
      byAmount.set(amount, {
        choice,
        amount,
        description: `${action.type === "raise" ? "Raise" : "Bet"} to exactly ${amount} chips, approximately ${label}${action.type === "raise" ? " after calling" : ""}.`,
      });
    }
  }

  if (!byAmount.has(action.maxAmount)) {
    byAmount.set(action.maxAmount, {
      choice: "all_in",
      amount: action.maxAmount,
      description: `Commit the maximum legal total of ${action.maxAmount} chips (all-in).`,
    });
  }

  return [...byAmount.values()];
}

export function createPokerDecisionRequest(
  state: PokerAIState,
): SystemOneRequest {
  const action: ChoiceQuestion = {
    type: "choice",
    instructions:
      "Choose the legal action with the highest expected chip value for HERO in this no-rake cash-game hand. Use the computed showdown equity as a baseline against random unknown hands, then adjust it for ranges implied by position and the complete action history. Compare adjusted equity with pot odds; account for effective stacks, stack-to-pot ratio, board texture, blockers, previous aggression, value available from worse hands, and realistic fold equity. Prefer robust value decisions over unnecessary variance. Do not use tournament survival, bankroll concerns, future cards, hidden cards, or information absent from the state.",
    criteria: createActionCriteria(state.legalActions),
  };
  const sizingOptions = createSizingOptions(state);
  const sizing: ChoiceQuestion = {
    type: "choice",
    instructions:
      "If HERO bets or raises, choose the exact legal sizing with the highest expected chip value. Use smaller sizes on dry or range-advantaged boards, larger sizes for strong value, vulnerable hands, draw-heavy boards, or polarized ranges, and all-in only when stack-to-pot ratio and value or fold equity justify it. Ignore this answer when no bet or raise is selected.",
    criteria: Object.fromEntries(
      sizingOptions.map((option) => [option.choice, option.description]),
    ),
  };

  return {
    model: "jev-latest",
    state,
    questions: { action, sizing },
  };
}
