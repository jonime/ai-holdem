import { afterEach, describe, expect, it, vi } from "vitest";

import { TypesafeSystemOneClient } from "./client";

const originalApiKey = process.env.TYPESAFE_API_KEY;
const originalExternalInference = process.env.EXTERNAL_INFERENCE_ENABLED;

afterEach(() => {
  process.env.TYPESAFE_API_KEY = originalApiKey;
  process.env.EXTERNAL_INFERENCE_ENABLED = originalExternalInference;
});

describe("TypesafeSystemOneClient", () => {
  it("sends the documented authenticated System One request", async () => {
    process.env.TYPESAFE_API_KEY = "test-key";
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ answers: {} }), { status: 200 }),
      );
    const client = new TypesafeSystemOneClient(fetcher);
    const request = {
      model: "jev-latest" as const,
      state: { value: "state" },
      questions: {
        action: {
          type: "choice" as const,
          instructions: "Choose.",
          criteria: { check: "Check." },
        },
      },
    };

    await expect(client.evaluate(request)).resolves.toEqual({ answers: {} });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.typesafe.ai/v1/systemone",
      {
        signal: expect.any(AbortSignal),
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      },
    );
  });

  it("rejects non-successful TypeSafe responses", async () => {
    process.env.TYPESAFE_API_KEY = "test-key";
    const client = new TypesafeSystemOneClient(
      async () =>
        new Response(JSON.stringify({ error: "bad request" }), { status: 422 }),
    );

    await expect(
      client.evaluate({ model: "jev-latest", state: {}, questions: {} }),
    ).rejects.toThrow("HTTP 422");
  });

  it.each([
    { status: 429, body: "broken", category: "rate_limit" },
    { status: 200, body: '{"error":{"code":429}}', category: "rate_limit" },
    { status: 200, body: "broken", category: "invalid_response" },
    { status: 503, body: "broken", category: "provider" },
  ])("preserves $category in its provider error class", async ({ status, body, category }) => {
    process.env.TYPESAFE_API_KEY = "test-key";
    process.env.EXTERNAL_INFERENCE_ENABLED = "true";
    const client = new TypesafeSystemOneClient(async () => new Response(body, { status }));
    await expect(client.evaluate({ model: "jev-latest", state: {}, questions: {} })).rejects.toMatchObject({
      name: "TypesafeRequestError", category, httpFailure: { httpStatus: status },
    });
  });

  it("enforces the external-inference guard before calling TypeSafe", async () => {
    process.env.EXTERNAL_INFERENCE_ENABLED = "false";
    process.env.TYPESAFE_API_KEY = "inherited-key-must-not-be-used";
    const fetcher = vi.fn();
    const client = new TypesafeSystemOneClient(fetcher);

    await expect(
      client.evaluate({ model: "jev-latest", state: {}, questions: {} }),
    ).rejects.toThrow("External inference is disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves safe clues for an undocumented credit response without retaining the response", async () => {
    process.env.EXTERNAL_INFERENCE_ENABLED = "true";
    process.env.TYPESAFE_API_KEY = "test-key";
    const client = new TypesafeSystemOneClient(async () => new Response(JSON.stringify({
      error: "Credits exhausted secret-key As Ks", error_type: "quota_exceeded",
    }), { status: 402 }));
    const error = await client.evaluate({ model: "jev-latest", state: {}, questions: {} }).catch(error => error);
    expect(error).toMatchObject({ httpFailure: {
      httpStatus: 402, creditMentioned: true, quotaMentioned: true,
    } });
    expect(JSON.stringify(error)).not.toMatch(/secret-key|As Ks/);
  });
});
