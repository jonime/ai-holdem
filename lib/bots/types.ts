import type { PokerAIState } from "@/lib/poker/ai-state";
import type { PokerAction } from "@/lib/poker/types";
import type { SizingChoice, SizingOption } from "@/lib/typesafe/questions";

export interface BotContext extends PokerAIState {
  readonly sizingOptions: readonly SizingOption[];
}

export interface BotDiagnostics {
  readonly probabilities: Readonly<Record<string, number>> | null;
  readonly confidence: number | null;
  readonly sizing: {
    readonly choice: SizingChoice;
    readonly probabilities: Readonly<Record<string, number>> | null;
    readonly confidence: number | null;
  } | null;
  readonly matchedRule: string | null;
  readonly promptVersion: string | null;
  readonly durationMs: number | null;
  readonly usage: unknown | null;
  readonly cost: number | null;
}

export interface BotDecision {
  readonly action: PokerAction;
  readonly diagnostics: BotDiagnostics;
  /** Persisted for audit only. It must never be sent in live responses. */
  readonly rawResponse: unknown | null;
}

export interface PokerBot {
  decide(context: BotContext): Promise<BotDecision>;
}

export class BotProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BotProviderError";
  }
}

export function emptyDiagnostics(
  values: Partial<BotDiagnostics> = {},
): BotDiagnostics {
  return {
    probabilities: null,
    confidence: null,
    sizing: null,
    matchedRule: null,
    promptVersion: null,
    durationMs: null,
    usage: null,
    cost: null,
    ...values,
  };
}
