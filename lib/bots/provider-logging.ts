import "server-only";

import { BotProviderError, botProviderFailureReason } from "./types";
import { TypesafeRequestError } from "@/lib/typesafe/client";
import { TypesafeResponseError } from "@/lib/typesafe/types";

export function logBotProviderFailure(gameId: string, error: unknown, outcome?: "fold_and_leave") {
  const httpFailure = error instanceof BotProviderError || error instanceof TypesafeRequestError
    ? error.httpFailure : undefined;
  const reason = error instanceof BotProviderError ? botProviderFailureReason(error)
    : error instanceof TypesafeRequestError ? "typesafe_request"
    : error instanceof TypesafeResponseError ? "typesafe_response" : "inference_disabled";
  console.warn("Bot decision failed", JSON.stringify({
    event: httpFailure ? error instanceof TypesafeRequestError
      ? "typesafe_provider_http_failure" : "llm_provider_http_failure" : "bot_decision_failed",
    gameId,
    reason,
    ...httpFailure,
    ...(outcome ? { outcome } : {}),
  }));
}
