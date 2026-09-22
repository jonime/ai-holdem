import type { PokerAIState } from "@/lib/poker/ai-state";
import type { LegalAction } from "@/lib/poker/types";

import type { ChoiceQuestion, SystemOneRequest } from "./types";

export function createActionCriteria(
  legalActions: readonly LegalAction[],
): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const action of legalActions) {
    if (action.type === "fold")
      criteria.fold =
        "Surrender the hand and stop participating in the current pot.";
    if (action.type === "check")
      criteria.check =
        "Continue without adding chips when no wager needs to be matched.";
    if (action.type === "call")
      criteria.call = "Match the current wager and continue in the hand.";
    if (action.type === "bet")
      criteria.bet = "Make the first wager on the current betting street.";
    if (action.type === "raise") criteria.raise = "Increase an existing wager.";
  }
  return criteria;
}

const sizingQuestion: ChoiceQuestion = {
  type: "choice",
  instructions:
    "If HERO bets or raises, choose an appropriate legal sizing. Ignore this answer when the selected action does not require a bet size.",
  criteria: {
    small: "Use the minimum legal bet or raise.",
    medium:
      "Use a medium legal bet or raise, around two thirds of the legal range.",
    large: "Use a large legal bet or raise near the top of the legal range.",
    all_in: "Commit the maximum legal amount.",
  },
};

export function createPokerDecisionRequest(
  state: PokerAIState,
): SystemOneRequest {
  const action: ChoiceQuestion = {
    type: "choice",
    instructions:
      "Choose the best legal action for HERO in this Texas Hold'em hand. Base the decision only on the provided state. Consider HERO's cards, community cards, position, pot size, amount required to continue, effective stacks, and previous actions. Do not assume hidden cards or information that is not provided.",
    criteria: createActionCriteria(state.legalActions),
  };

  return {
    model: "jev-latest",
    state,
    questions: {
      action,
      sizing: sizingQuestion,
    },
  };
}
