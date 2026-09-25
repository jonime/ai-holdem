import type { PokerAction } from "@/lib/poker/types";
import type { SizingChoice } from "./questions";

export interface ChoiceQuestion {
  readonly type: "choice";
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string>>;
}

export interface SystemOneRequest {
  readonly model: "jev-latest";
  readonly state: unknown;
  readonly questions: Readonly<Record<string, ChoiceQuestion>>;
}

export interface AIDecision {
  readonly action: PokerAction;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number;
  readonly sizing?: {
    readonly choice: SizingChoice;
    readonly probabilities: Readonly<Record<string, number>>;
      readonly confidence: number;
  };
  readonly candidateChoice: string;
  readonly candidateProbabilities: Readonly<Record<string, number>>;
  readonly rawResponse: unknown;
}

export class TypesafeResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypesafeResponseError";
  }
}
