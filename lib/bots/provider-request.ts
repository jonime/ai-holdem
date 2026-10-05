import "server-only";

import { BotProviderError, type ProviderFailureCategory } from "./types";
import { providerHttpFailureDiagnostics } from "./provider-http-failure";

export const PROVIDER_DEADLINE_MS = 60_000;
export type ProviderFetch = (input: string, init: RequestInit) => Promise<Response>;

/** One deadline covers headers and body. No retries or provider data escapes. */
export async function requestProviderJson(fetcher: ProviderFetch, url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const started = performance.now();
  let phase: "headers" | "body" | "response" = "headers";
  let response: Response | undefined;
  let expired = false;
  const details = (category: ProviderFailureCategory) => ({
    category, phase, elapsedMs: Math.round(performance.now() - started),
  });
  const failure = (category: ProviderFailureCategory, body: unknown = null) => new BotProviderError(
    response ? `Provider request failed with HTTP ${response.status}` : "Provider request failed",
    response ? providerHttpFailureDiagnostics(response, body) : undefined,
    details(category),
  );
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      // Reject before aborting so even abort-aware body readers retain timeout classification.
      reject(failure("timeout"));
      controller.abort();
    }, PROVIDER_DEADLINE_MS);
  });
  try {
    response = await Promise.race([fetcher(url, { ...init, signal: controller.signal }), deadline]);
    phase = "body";
    let body: unknown;
    try {
      body = await Promise.race([response.json(), deadline]);
    } catch (error) {
      if (expired) throw failure("timeout");
      if (!(error instanceof SyntaxError)) throw failure("network");
      // An unreadable error body must not erase its HTTP status/category.
      if (response.ok) throw failure("invalid_response");
      body = null;
    }
    phase = "response";
    const embeddedError = typeof body === "object" && body !== null && "error" in body && body.error != null;
    if (!response.ok || embeddedError) {
      const diagnostics = providerHttpFailureDiagnostics(response, body);
      throw failure(response.status === 429 || diagnostics.providerErrorCode === 429 ? "rate_limit" : "provider", body);
    }
    return body;
  } catch (error) {
    if (error instanceof BotProviderError) throw error;
    throw failure(expired ? "timeout" : "network");
  } finally {
    clearTimeout(timer!);
  }
}
