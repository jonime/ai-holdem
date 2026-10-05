import type { PokerAIState } from "@/lib/poker/ai-state";
import type { PokerAction } from "@/lib/poker/types";
import type { BotPlaystyleId } from "@/lib/poker/types";
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
  readonly botProfileId: BotPlaystyleId | null;
  readonly durationMs: number | null;
  readonly usage: unknown | null;
  readonly cost: number | null;
}

export interface BotDecision {
  readonly action: PokerAction;
  readonly diagnostics: BotDiagnostics;
  /** Persisted for audit only. It must never be sent in live responses. */
  readonly suppliedContext?: unknown;
  readonly rawResponse: unknown | null;
}

export interface PokerBot {
  decide(context: BotContext): Promise<BotDecision>;
}

export const botProviderFailureReasons = {
  "LLM provider returned a malformed response": "malformed_response",
  "LLM provider returned no structured decision": "missing_decision",
  "LLM provider returned invalid decision JSON": "invalid_json",
  "LLM provider returned an invalid decision": "invalid_decision",
  "LLM provider selected an illegal action": "illegal_action",
  "LLM provider selected sizing for a passive action": "passive_sizing",
  "LLM provider omitted a required sizing choice": "missing_sizing",
  "LLM provider selected an unavailable sizing": "unavailable_sizing",
  "LLM provider timed out": "timeout",
  "LLM provider request failed": "request_failed",
} as const;

export function botProviderFailureReason(error: BotProviderError): string {
  const known = Object.entries(botProviderFailureReasons).find(([message]) => message === error.message);
  if (known) return known[1];
  const http = /^LLM provider request failed with HTTP ([1-5][0-9]{2})$/.exec(error.message);
  return http ? `http_${http[1]}` : "unknown";
}

export interface ProviderHttpFailureDiagnostics {
  readonly httpStatus: number;
  readonly providerErrorCode: number | null;
  readonly retryAfterSeconds: number | null;
  readonly retryAfterPresent: boolean;
  readonly creditMentioned: boolean;
  readonly quotaMentioned: boolean;
  readonly rateLimitMentioned: boolean;
  readonly limitSource: "openrouter_key_limit" | "openrouter_credits" | "openrouter_in_flight_budget" | "unknown" | null;
}

export const LLM_CREDIT_EXIT_RULE = "llm_credit_limit_exit";

export class BotProviderError extends Error {
  constructor(message: string, readonly httpFailure?: ProviderHttpFailureDiagnostics) {
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
    botProfileId: null,
    durationMs: null,
    usage: null,
    cost: null,
    ...values,
  };
}
