import type { PokerAIState } from "@/lib/poker/ai-state";
import type { LegalAction, PokerAction } from "@/lib/poker/types";

import type { ChoiceQuestion, SystemOneRequest } from "./types";

export const typesafePokerPolicyVersion = "typesafe-poker-v2";

export type SizingChoice =
  | "two_big_blinds"
  | "two_and_half_big_blinds"
  | "three_big_blinds"
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

export interface MoveOption {
  readonly choice: string;
  readonly action: PokerAction;
  readonly sizingChoice: SizingChoice;
  readonly description: string;
}

export function createActionCriteria(
  legalActions: readonly LegalAction[],
): Record<string, string> {
  const canCheck = legalActions.some((action) => action.type === "check");
  const criteria: Record<string, string> = {};
  for (const action of legalActions) {
    if (action.type === "fold" && !canCheck)
      criteria.fold =
        "Fold only when continuing has negative chip EV against the opponents' likely ranges.";
    if (action.type === "check")
      criteria.check =
        "Take the free card or showdown when betting would not gain enough value or fold equity; also use checks to protect the checking range.";
    if (action.type === "call")
      criteria.call =
        "Continue when equity and future value justify the contestable-pot odds, especially with bluff catchers or draws that should not raise.";
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

function isUnopenedPreflopPot(state: PokerAIState): boolean {
  return (
    state.hand.street === "preflop" &&
    !state.actionHistory.some((item) => item.street === "preflop")
  );
}

function aggressiveAction(state: PokerAIState) {
  return state.legalActions.find(
    (candidate) => candidate.type === "bet" || candidate.type === "raise",
  );
}

/** Legacy shared sizing used by non-TypeSafe providers. */
export function createSizingOptions(state: PokerAIState): readonly SizingOption[] {
  const action = aggressiveAction(state);
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

export function createTypesafeSizingOptions(
  state: PokerAIState,
): readonly SizingOption[] {
  const action = aggressiveAction(state);
  if (!action || (action.type !== "bet" && action.type !== "raise")) {
    return [
      {
        choice: "not_applicable",
        amount: null,
        description: "No bet or raise is available.",
      },
    ];
  }

  const byAmount = new Map<number, SizingOption>();
  const add = (choice: SizingChoice, desired: number, label: string) => {
    const amount = clamp(desired, action.minAmount, action.maxAmount);
    if (byAmount.has(amount)) return;
    const additional = amount - state.hero.investedThisStreet;
    const resultingPot =
      state.hand.pot + state.hero.amountToCall + additional;
    byAmount.set(amount, {
      choice,
      amount,
      description: `${action.type === "raise" ? "Raise" : "Bet"} to exactly ${amount} chips (${label}); pay ${additional} additional chips and put ${resultingPot} chips in the middle after the move.`,
    });
  };

  // Reserve the maximum amount first so a clamped fractional size cannot hide
  // the explicit all-in candidate.
  add("all_in", action.maxAmount, "all-in");

  if (action.type === "raise" && isUnopenedPreflopPot(state)) {
    add("two_big_blinds", state.game.bigBlind * 2, "2 big blinds");
    add(
      "two_and_half_big_blinds",
      Math.round(state.game.bigBlind * 2.5),
      "2.5 big blinds",
    );
    add("three_big_blinds", state.game.bigBlind * 3, "3 big blinds");
  } else {
    const potAfterCall = state.hand.pot + state.hero.amountToCall;
    const matchedCommitment =
      state.hero.investedThisStreet + state.hero.amountToCall;
    const fractions = [
      ["one_third_pot", 1 / 3, "one third pot"] as const,
      ["one_half_pot", 1 / 2, "one half pot"] as const,
      ["two_thirds_pot", 2 / 3, "two thirds pot"] as const,
      ["full_pot", 1, "full pot"] as const,
    ];
    for (const [choice, fraction, label] of fractions) {
      const desired =
        action.type === "bet"
          ? state.hero.investedThisStreet +
            Math.round(state.hand.pot * fraction)
          : matchedCommitment + Math.round(potAfterCall * fraction);
      add(choice, desired, label);
    }
  }

  return [...byAmount.values()].sort(
    (left, right) => (left.amount ?? 0) - (right.amount ?? 0),
  );
}

function passiveDescription(
  state: PokerAIState,
  action: Extract<PokerAction, { type: "fold" | "check" | "call" }>,
): string {
  if (action.type === "fold") {
    return `Fold, pay 0 additional chips, and surrender the ${state.hand.pot}-chip pot.`;
  }
  if (action.type === "check") {
    return `Check for 0 additional chips; the pot remains ${state.hand.pot} chips.`;
  }
  return `Call exactly ${action.amount ?? 0} additional chips; the contestable pot after calling is ${state.analysis.contestablePotAfterCall} chips (pot odds ${state.analysis.potOddsToCall}).`;
}

export function createMoveOptions(state: PokerAIState): readonly MoveOption[] {
  const canCheck = state.legalActions.some((action) => action.type === "check");
  const moves: MoveOption[] = [];
  for (const legalAction of state.legalActions) {
    if (legalAction.type === "fold") {
      if (!canCheck) {
        const action = { type: "fold" } as const;
        moves.push({
          choice: "fold",
          action,
          sizingChoice: "not_applicable",
          description: passiveDescription(state, action),
        });
      }
      continue;
    }
    if (legalAction.type === "check") {
      const action = { type: "check" } as const;
      moves.push({
        choice: "check",
        action,
        sizingChoice: "not_applicable",
        description: passiveDescription(state, action),
      });
      continue;
    }
    if (legalAction.type === "call") {
      const action = { type: "call", amount: legalAction.amount } as const;
      moves.push({
        choice: "call",
        action,
        sizingChoice: "not_applicable",
        description: passiveDescription(state, action),
      });
      continue;
    }
    for (const sizing of createTypesafeSizingOptions(state)) {
      if (sizing.amount === null) continue;
      moves.push({
        choice: `${legalAction.type}_to_${sizing.amount}`,
        action: { type: legalAction.type, amount: sizing.amount },
        sizingChoice: sizing.choice,
        description: sizing.description,
      });
    }
  }
  return moves;
}

export function createPokerDecisionRequest(
  state: PokerAIState,
): SystemOneRequest {
  const moves = createMoveOptions(state);
  const move: ChoiceQuestion = {
    type: "choice",
    instructions:
      "Choose the complete legal move with the highest expected chip value for HERO in this no-rake cash-game hand. The supplied showdown equity is explicitly against random opponent hands, not the probability of beating the opponent's betting range; adjust for ranges implied by position and the complete action history. Compare that adjusted assessment with the supplied contestable-pot odds and account for effective stacks, stack-to-pot ratio, board texture, blockers, previous aggression, value available from worse hands, and realistic fold equity. Prefer robust value decisions over unnecessary variance. Do not treat returned probabilities as poker bluffing frequencies. Do not use tournament survival, bankroll concerns, future cards, hidden cards, or information absent from the state.",
    criteria: Object.fromEntries(
      moves.map((option) => [option.choice, option.description]),
    ),
  };

  return {
    model: "jev-latest",
    state,
    questions: { move },
  };
}
