import type { PokerAIState } from "@/lib/poker/ai-state";
import type { LegalAction, PokerAction } from "@/lib/poker/types";

import { createPokerDecisionRequest } from "./questions";
import type { AIDecision } from "./types";
import { TypesafeResponseError } from "./types";

export interface TypesafeDecisionClient {
  evaluate(
    request: ReturnType<typeof createPokerDecisionRequest>,
  ): Promise<unknown>;
}

type SizingChoice = "small" | "medium" | "large" | "all_in";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function choiceAnswer(
  response: unknown,
  key: string,
): {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
} {
  if (
    !isRecord(response) ||
    !isRecord(response.answers) ||
    !isRecord(response.answers[key])
  ) {
    throw new TypesafeResponseError(`Missing TypeSafe ${key} answer`);
  }
  const answer = response.answers[key];
  if (
    answer.type !== "choice" ||
    typeof answer.choice !== "string" ||
    typeof answer.confidence !== "number" ||
    answer.confidence < 0 ||
    answer.confidence > 1 ||
    !isRecord(answer.probabilities)
  ) {
    throw new TypesafeResponseError(`Malformed TypeSafe ${key} answer`);
  }
  const probabilities: Record<string, number> = {};
  for (const [option, probability] of Object.entries(answer.probabilities)) {
    if (typeof probability !== "number" || probability < 0 || probability > 1) {
      throw new TypesafeResponseError(
        `Malformed TypeSafe ${key} probabilities`,
      );
    }
    probabilities[option] = probability;
  }
  return {
    choice: answer.choice,
    probabilities,
    confidence: answer.confidence,
  };
}

function actionFromChoice(
  choice: string,
  legalActions: readonly LegalAction[],
  sizing: SizingChoice,
): PokerAction {
  const legalAction = legalActions.find((action) => action.type === choice);
  if (!legalAction) {
    throw new TypesafeResponseError(
      `TypeSafe selected an illegal action: ${choice}`,
    );
  }
  if (legalAction.type === "fold" || legalAction.type === "check")
    return legalAction;
  if (legalAction.type === "call")
    return { type: "call", amount: legalAction.amount };

  const range = legalAction.maxAmount - legalAction.minAmount;
  const amount =
    sizing === "all_in"
      ? legalAction.maxAmount
      : sizing === "small"
        ? legalAction.minAmount
        : sizing === "medium"
          ? legalAction.minAmount + Math.round(range * 0.6)
          : legalAction.minAmount + Math.round(range * 0.85);
  return {
    type: legalAction.type,
    amount: Math.min(
      legalAction.maxAmount,
      Math.max(legalAction.minAmount, amount),
    ),
  };
}

export async function decidePokerAction(
  client: TypesafeDecisionClient,
  state: PokerAIState,
): Promise<AIDecision> {
  const response = await client.evaluate(createPokerDecisionRequest(state));
  const actionAnswer = choiceAnswer(response, "action");
  const sizingAnswer = choiceAnswer(response, "sizing");
  if (
    !(["small", "medium", "large", "all_in"] as const).includes(
      sizingAnswer.choice as SizingChoice,
    )
  ) {
    throw new TypesafeResponseError(
      "TypeSafe selected an invalid sizing choice",
    );
  }
  const sizing = sizingAnswer.choice as SizingChoice;
  const action = actionFromChoice(
    actionAnswer.choice,
    state.legalActions,
    sizing,
  );

  return {
    action,
    probabilities: actionAnswer.probabilities,
    confidence: actionAnswer.confidence,
    ...(action.type === "bet" || action.type === "raise"
      ? {
          sizing: {
            choice: sizing,
            probabilities: sizingAnswer.probabilities,
            confidence: sizingAnswer.confidence,
          },
        }
      : {}),
    rawResponse: response,
  };
}
