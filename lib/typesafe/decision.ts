import type { PokerAIState } from "@/lib/poker/ai-state";
import type { LegalAction, PokerAction } from "@/lib/poker/types";

import {
  createPokerDecisionRequest,
  createSizingOptions,
  type SizingChoice,
} from "./questions";
import type { AIDecision } from "./types";
import { TypesafeResponseError } from "./types";

export interface TypesafeDecisionClient {
  evaluate(
    request: ReturnType<typeof createPokerDecisionRequest>,
  ): Promise<unknown>;
}

export interface DecidePokerActionOptions {
  readonly random?: () => number;
}

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
    if (
      typeof probability !== "number" ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 1
    ) {
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

function sampleChoice(
  choices: readonly string[],
  probabilities: Readonly<Record<string, number>>,
  preferredChoice: string,
  random: () => number,
  uniformMix: number,
): string {
  const total = choices.reduce(
    (sum, choice) => sum + (probabilities[choice] ?? 0),
    0,
  );
  if (total <= 0) {
    return choices.includes(preferredChoice) ? preferredChoice : choices[0];
  }
  const uniformProbability = 1 / choices.length;
  const weighted = choices.map(
    (choice) =>
      (1 - uniformMix) * ((probabilities[choice] ?? 0) / total) +
      uniformMix * uniformProbability,
  );
  const target = Math.min(0.999999999, Math.max(0, random()));
  let cumulative = 0;
  for (let index = 0; index < choices.length; index += 1) {
    cumulative += weighted[index];
    if (target < cumulative) return choices[index];
  }
  return choices.at(-1) ?? preferredChoice;
}

function selectChoice(
  state: PokerAIState,
  choices: readonly string[],
  answer: ReturnType<typeof choiceAnswer>,
  random: () => number,
): string {
  if (!choices.includes(answer.choice)) {
    throw new TypesafeResponseError(
      `TypeSafe selected an unavailable choice: ${answer.choice}`,
    );
  }
  if (state.difficulty === "hard") return answer.choice;
  return sampleChoice(
    choices,
    answer.probabilities,
    answer.choice,
    random,
    state.difficulty === "easy" ? 0.5 : 0,
  );
}

function actionFromChoice(
  choice: string,
  legalActions: readonly LegalAction[],
  sizingAmount: number | null,
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
  if (sizingAmount === null) {
    throw new TypesafeResponseError("TypeSafe selected no actionable sizing");
  }
  return { type: legalAction.type, amount: sizingAmount };
}

export async function decidePokerAction(
  client: TypesafeDecisionClient,
  state: PokerAIState,
  options: DecidePokerActionOptions = {},
): Promise<AIDecision> {
  const response = await client.evaluate(createPokerDecisionRequest(state));
  const actionAnswer = choiceAnswer(response, "action");
  const sizingAnswer = choiceAnswer(response, "sizing");
  const random = options.random ?? Math.random;
  const legalActionChoices = state.legalActions.map((action) => action.type);
  const actionChoice = selectChoice(
    state,
    legalActionChoices,
    actionAnswer,
    random,
  );
  const sizingOptions = createSizingOptions(state);
  const sizingChoices = sizingOptions.map((option) => option.choice);
  const sizingChoice = selectChoice(
    state,
    sizingChoices,
    sizingAnswer,
    random,
  ) as SizingChoice;
  const sizingAmount =
    sizingOptions.find((option) => option.choice === sizingChoice)?.amount ??
    null;
  const action = actionFromChoice(
    actionChoice,
    state.legalActions,
    sizingAmount,
  );

  return {
    action,
    probabilities: actionAnswer.probabilities,
    confidence: actionAnswer.confidence,
    ...(action.type === "bet" || action.type === "raise"
      ? {
          sizing: {
            choice: sizingChoice,
            probabilities: sizingAnswer.probabilities,
            confidence: sizingAnswer.confidence,
          },
        }
      : {}),
    rawResponse: response,
  };
}
