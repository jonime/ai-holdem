import "server-only";

import { BotProviderError, botProviderFailureReason } from "./types";
import { EevoRequestError } from "@/lib/eevo/client";
import { EevoResponseError } from "./eevo";
import { TypesafeRequestError } from "@/lib/typesafe/client";
import { TypesafeResponseError } from "@/lib/typesafe/types";
import { SystemOneResponseError } from "@/lib/systemone/types";

export function logBotProviderFailure(gameId: string, error: unknown, outcome?: "fold_and_leave") {
  const httpFailure = error instanceof BotProviderError || error instanceof TypesafeRequestError
    ? error.httpFailure : undefined;
  const reason = error instanceof EevoRequestError ? "eevo_request"
    : error instanceof EevoResponseError ? "eevo_response"
    : error instanceof TypesafeRequestError ? "typesafe_request"
    : error instanceof BotProviderError ? botProviderFailureReason(error)
    : error instanceof TypesafeResponseError ? "typesafe_response" : "inference_disabled";
  console.warn("Bot decision failed", JSON.stringify({
    event: httpFailure ? error instanceof EevoRequestError ? "eevo_provider_http_failure" : error instanceof TypesafeRequestError
      ? "typesafe_provider_http_failure" : "llm_provider_http_failure" : "bot_decision_failed",
    gameId,
    reason,
    ...httpFailure,
    ...(error instanceof BotProviderError ? error.requestFailure : { category: error instanceof SystemOneResponseError ? "invalid_response" : "provider" }),
    ...(outcome ? { outcome } : {}),
  }));
}
