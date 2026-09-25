import type { PokerAIState } from "@/lib/poker/ai-state";

import {
  createMoveOptions,
  createPokerDecisionRequest,
  typesafePokerPolicyVersion,
  type MoveOption,
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

interface ChoiceAnswer {
  readonly choice: string;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function choiceAnswer(
  response: unknown,
  key: string,
  choices: readonly string[],
): ChoiceAnswer {
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
    !choices.includes(answer.choice) ||
    typeof answer.confidence !== "number" ||
    !Number.isFinite(answer.confidence) ||
    answer.confidence < 0 ||
    answer.confidence > 1 ||
    !isRecord(answer.probabilities)
  ) {
    throw new TypesafeResponseError(`Malformed TypeSafe ${key} answer`);
  }
  const probabilities: Record<string, number> = {};
  let total = 0;
  for (const choice of choices) {
    const probability = answer.probabilities[choice];
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
    probabilities[choice] = probability;
    total += probability;
  }
  if (Object.keys(answer.probabilities).some((choice) => !choices.includes(choice))) {
    throw new TypesafeResponseError(
      `TypeSafe ${key} probabilities include an unavailable choice`,
    );
  }
  if (!Number.isFinite(total) || total <= 0) {
    throw new TypesafeResponseError(
      `TypeSafe ${key} probabilities must sum to a positive value`,
    );
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
): string {
  const total = choices.reduce(
    (sum, choice) => sum + (probabilities[choice] ?? 0),
    0,
  );
  if (total <= 0) return preferredChoice;
  const uniformProbability = 1 / choices.length;
  const weighted = choices.map(
    (choice) =>
      0.5 * ((probabilities[choice] ?? 0) / total) +
      0.5 * uniformProbability,
  );
  const target = Math.min(0.999999999, Math.max(0, random()));
  let cumulative = 0;
  for (let index = 0; index < choices.length; index += 1) {
    cumulative += weighted[index];
    if (target < cumulative) return choices[index];
  }
  return choices.at(-1) ?? preferredChoice;
}

function aggregateActionProbabilities(
  options: readonly MoveOption[],
  probabilities: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const option of options) {
    result[option.action.type] =
      (result[option.action.type] ?? 0) + (probabilities[option.choice] ?? 0);
  }
  return result;
}

function aggregateSizingProbabilities(
  options: readonly MoveOption[],
  probabilities: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const option of options) {
    if (option.sizingChoice === "not_applicable") continue;
    result[option.sizingChoice] =
      (result[option.sizingChoice] ?? 0) +
      (probabilities[option.choice] ?? 0);
  }
  return result;
}

export async function decidePokerAction(
  client: TypesafeDecisionClient,
  state: PokerAIState,
  options: DecidePokerActionOptions = {},
): Promise<AIDecision> {
  const moveOptions = createMoveOptions(state);
  const choices = moveOptions.map((option) => option.choice);
  if (choices.length === 0) {
    throw new TypesafeResponseError("No legal TypeSafe move candidates");
  }
  const response = await client.evaluate(createPokerDecisionRequest(state));
  const answer = choiceAnswer(response, "move", choices);
  const selectedChoice =
    state.difficulty === "easy"
      ? sampleChoice(
          choices,
          answer.probabilities,
          answer.choice,
          options.random ?? Math.random,
        )
      : answer.choice;
  const selected = moveOptions.find(
    (candidate) => candidate.choice === selectedChoice,
  );
  if (!selected) {
    throw new TypesafeResponseError(
      `TypeSafe selected an unavailable move: ${selectedChoice}`,
    );
  }

  const actionProbabilities = aggregateActionProbabilities(
    moveOptions,
    answer.probabilities,
  );
  const sizingProbabilities = aggregateSizingProbabilities(
    moveOptions,
    answer.probabilities,
  );
  const aggressive =
    selected.action.type === "bet" || selected.action.type === "raise";

  return {
    action: selected.action,
    probabilities: actionProbabilities,
    confidence: answer.confidence,
    ...(aggressive
      ? {
          sizing: {
            choice: selected.sizingChoice as SizingChoice,
            probabilities: sizingProbabilities,
            confidence: answer.confidence,
          },
        }
      : {}),
    candidateChoice: selected.choice,
    candidateProbabilities: answer.probabilities,
    rawResponse: {
      policyVersion: typesafePokerPolicyVersion,
      providerResponse: response,
      decision: {
        selectedCandidate: selected.choice,
        candidateProbabilities: answer.probabilities,
        candidates: moveOptions.map((candidate) => ({
          choice: candidate.choice,
          action: candidate.action,
          sizingChoice: candidate.sizingChoice,
        })),
      },
    },
  };
}
