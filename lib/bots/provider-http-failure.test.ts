import { describe, expect, it } from "vitest";

import { isLlmCreditFailure, providerHttpFailureDiagnostics } from "./provider-http-failure";
import { BotProviderError } from "./types";

describe("LLM HTTP failure log diagnostics", () => {
  it("extracts credit and quota clues without retaining private provider fields", () => {
    const body = { error: {
      code: 402,
      message: "Insufficient credits: spending quota exceeded. secret-key As Ks",
      metadata: { raw: "private provider response", api_key: "secret-key" },
    }, choices: [{ message: { content: "private decision" } }] };
    const diagnostics = providerHttpFailureDiagnostics(new Response(null, { status: 402 }), body);
    expect(diagnostics).toEqual({
      httpStatus: 402, providerErrorCode: 402, retryAfterSeconds: null, retryAfterPresent: false,
      creditMentioned: true, quotaMentioned: true, rateLimitMentioned: false, limitSource: null,
    });
    expect(JSON.stringify(diagnostics)).not.toMatch(/secret-key|As Ks|private/);
  });

  it("records temporary rate limits and a numeric retry delay", () => {
    expect(providerHttpFailureDiagnostics(
      new Response(null, { status: 429, headers: { "retry-after": "30" } }),
      { error: { code: 429, message: "Rate limit exceeded" } },
    )).toEqual({
      httpStatus: 429, providerErrorCode: 429, retryAfterSeconds: 30, retryAfterPresent: true,
      creditMentioned: false, quotaMentioned: false, rateLimitMentioned: true, limitSource: null,
    });
  });

  it.each([null, "secret", [], { error: "secret" }, { error: {
    code: "secret", message: { secret: "value" },
  } }, { error: { code: 999999 } }])("handles unknown error bodies safely: %j", body => {
    expect(providerHttpFailureDiagnostics(
      new Response(null, { status: 503, headers: { "retry-after": "secret" } }), body,
    )).toEqual({
      httpStatus: 503, providerErrorCode: null, retryAfterSeconds: null, retryAfterPresent: true,
      creditMentioned: false, quotaMentioned: false, rateLimitMentioned: false, limitSource: null,
    });
  });
});

describe("LLM credit departure classification", () => {
  it.each([
    { status: 402, source: "openrouter_key_limit", retry: "30", leaves: true },
    { status: 402, source: "openrouter_credits", retry: null, leaves: true },
    { status: 402, source: "openrouter_in_flight_budget", retry: null, leaves: false },
    { status: 402, source: null, retry: "30", leaves: false },
    { status: 402, source: null, retry: "Wed, 21 Oct 2026 07:28:00 GMT", leaves: false },
    { status: 402, source: "undocumented-source", retry: null, leaves: false },
    { status: 402, source: null, retry: null, leaves: true },
    { status: 429, source: "openrouter_credits", retry: null, leaves: false },
    { status: 503, source: null, retry: null, leaves: false },
  ])("classifies $status / $source with retry $retry", ({ status, source, retry, leaves }) => {
    const response = new Response(null, { status, headers: retry ? { "retry-after": retry } : {} });
    const details = providerHttpFailureDiagnostics(response, { error: { metadata: { limit_source: source } } });
    expect(isLlmCreditFailure(new BotProviderError("request failed", details))).toBe(leaves);
  });
  it("handles an error envelope returned with HTTP 200", () => {
    const details = providerHttpFailureDiagnostics(new Response(null), { error: { code: 402 } });
    expect(isLlmCreditFailure(new BotProviderError("request failed", details))).toBe(true);
  });
  it("does not act on arbitrary error messages or unknown metadata", () => {
    expect(isLlmCreditFailure(new Error("insufficient credits"))).toBe(false);
    expect(isLlmCreditFailure(new BotProviderError("HTTP 402"))).toBe(false);
    const details = providerHttpFailureDiagnostics(new Response(null, { status: 500 }), {
      error: { metadata: { limit_source: "secret-key" } },
    });
    expect(details.limitSource).toBe("unknown");
    expect(isLlmCreditFailure(new BotProviderError("request failed", details))).toBe(false);
  });
});

it.each(["timeout", "network", "rate_limit", "invalid_response"] as const)("never retires a %s failure even with credit HTTP diagnostics", category => {
  const details = providerHttpFailureDiagnostics(new Response(null, { status: 402 }), { error: { code: 402 } });
  expect(isLlmCreditFailure(new BotProviderError("private", details, { category }))).toBe(false);
});
