import type { PokerAction } from "@/lib/poker/types";

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
    readonly choice: "small" | "medium" | "large" | "all_in";
    readonly probabilities: Readonly<Record<string, number>>;
    readonly confidence: number;
  };
  readonly rawResponse: unknown;
}

export class TypesafeResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypesafeResponseError";
  }
}
