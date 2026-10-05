import "server-only";

import { BotProviderError, type ProviderHttpFailureDiagnostics } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Convert untrusted provider errors into fixed, non-sensitive log fields. */
export function providerHttpFailureDiagnostics(
  response: Response,
  body: unknown,
): ProviderHttpFailureDiagnostics {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const message = [error?.message, isRecord(body) ? body.error : null,
    isRecord(body) ? body.message : null, isRecord(body) ? body.error_type : null]
    .filter((value): value is string => typeof value === "string")
    .join(" ").replace(/[_-]/g, " ");
  const code = error?.code;
  const retryAfter = response.headers.get("retry-after");
  const seconds = retryAfter !== null && /^\d{1,8}$/.test(retryAfter)
    ? Number(retryAfter) : null;
  const source = error && isRecord(error.metadata) ? error.metadata.limit_source : null;

  return {
    httpStatus: response.status,
    providerErrorCode: typeof code === "number" && Number.isInteger(code) &&
      code >= 100 && code <= 599 ? code : null,
    retryAfterSeconds: seconds,
    retryAfterPresent: retryAfter !== null,
    creditMentioned: /\bcredits?\b|\bbalance\b|\bbudget\b|\bspend(?:ing)?\b/i.test(message),
    quotaMentioned: /\bquota\b/i.test(message),
    rateLimitMentioned: /\brate[\s_-]*limit/i.test(message),
    limitSource: source === "openrouter_key_limit" || source === "openrouter_credits" ||
      source === "openrouter_in_flight_budget" ? source : source == null ? null : "unknown",
  };
}

/** A plain 402 is the documented credit error; transient spending holds stay paused. */
export function isLlmCreditFailure(error: unknown): error is BotProviderError {
  if (!(error instanceof BotProviderError) || !error.httpFailure) return false;
  const details = error.httpFailure;
  if (details.httpStatus !== 402 && !(details.httpStatus === 200 && details.providerErrorCode === 402)) return false;
  if (details.limitSource === "openrouter_in_flight_budget" || details.limitSource === "unknown") return false;
  return details.limitSource === "openrouter_key_limit" || details.limitSource === "openrouter_credits" ||
    !details.retryAfterPresent;
}
