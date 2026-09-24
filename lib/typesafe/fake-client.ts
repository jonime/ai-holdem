import type { SystemOneRequest } from "./types";

const actionPriority = ["check", "call", "fold", "bet", "raise"] as const;
const sizingPriority = [
  "one_third_pot",
  "one_half_pot",
  "two_thirds_pot",
  "full_pot",
  "all_in",
  "not_applicable",
] as const;

function pickChoice(
  criteria: Readonly<Record<string, string>>,
  priority: readonly string[],
): string {
  const available = Object.keys(criteria);
  const preferred = priority.find((choice) => available.includes(choice));
  return preferred ?? available[0];
}

function certainAnswer(
  choice: string,
  criteria: Readonly<Record<string, string>>,
) {
  const probabilities: Record<string, number> = {};
  for (const option of Object.keys(criteria)) {
    probabilities[option] = option === choice ? 1 : 0;
  }
  return { type: "choice" as const, choice, probabilities, confidence: 0.9 };
}

/**
 * Deterministic stand-in for TypesafeSystemOneClient so e2e runs never call
 * the real TypeSafe/jev model. Always prefers checking/calling over betting.
 */
export class FakeTypesafeClient {
  async evaluate(request: SystemOneRequest): Promise<unknown> {
    const actionChoice = pickChoice(
      request.questions.action.criteria,
      actionPriority,
    );
    const sizingChoice = pickChoice(
      request.questions.sizing.criteria,
      sizingPriority,
    );
    return {
      answers: {
        action: certainAnswer(actionChoice, request.questions.action.criteria),
        sizing: certainAnswer(sizingChoice, request.questions.sizing.criteria),
      },
    };
  }
}
