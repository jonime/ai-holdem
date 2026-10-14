import { afterEach, describe, expect, it, vi } from "vitest";

import { EevoSystemOneClient } from "./client";



afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("EevoSystemOneClient", () => {
  it("sends the documented authenticated System One request", async () => {
    vi.stubEnv("EEVO_API_KEY", "test-key");
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ answers: {} }), { status: 200 }),
      );
    const client = new EevoSystemOneClient(fetcher);
    const request = {
      model: "eevo-1" as const,
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
      "https://eevo.io/api/v1/systemone",
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

  it("rejects non-successful Eevo responses", async () => {
    vi.stubEnv("EEVO_API_KEY", "test-key");
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    const client = new EevoSystemOneClient(
      async () =>
        new Response(JSON.stringify({ error: "bad request" }), { status: 422 }),
    );

    await expect(
      client.evaluate({ model: "eevo-1", state: {}, questions: {} }),
    ).rejects.toThrow("HTTP 422");
  });

  it.each([
    { status: 429, body: "broken", category: "rate_limit" },
    { status: 200, body: '{"error":{"code":429}}', category: "rate_limit" },
    { status: 200, body: "broken", category: "invalid_response" },
    { status: 503, body: "broken", category: "provider" },
  ])("preserves $category in its provider error class", async ({ status, body, category }) => {
    vi.stubEnv("EEVO_API_KEY", "test-key");
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    const client = new EevoSystemOneClient(async () => new Response(body, { status }));
    await expect(client.evaluate({ model: "eevo-1", state: {}, questions: {} })).rejects.toMatchObject({
      name: "EevoRequestError", category, httpFailure: { httpStatus: status },
    });
  });

  it("enforces the external-inference guard before calling Eevo", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "false");
    vi.stubEnv("EEVO_API_KEY", "inherited-key-must-not-be-used");
    const fetcher = vi.fn();
    const client = new EevoSystemOneClient(fetcher);

    await expect(
      client.evaluate({ model: "eevo-1", state: {}, questions: {} }),
    ).rejects.toThrow("External inference is disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves safe clues for an undocumented credit response without retaining the response", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    vi.stubEnv("EEVO_API_KEY", "test-key");
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    const client = new EevoSystemOneClient(async () => new Response(JSON.stringify({
      error: "Credits exhausted secret-key As Ks", error_type: "quota_exceeded",
    }), { status: 402 }));
    const error = await client.evaluate({ model: "eevo-1", state: {}, questions: {} }).catch(error => error);
    expect(error).toMatchObject({ httpFailure: {
      httpStatus: 402, creditMentioned: true, quotaMentioned: true,
    } });
    expect(JSON.stringify(error)).not.toMatch(/secret-key|As Ks/);
  });
});

it.each(["headers", "body"])("Eevo uses the shared 60-second %s deadline", async phase => {
  vi.useFakeTimers();
  vi.stubEnv("EEVO_API_KEY", "test-key");
  vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
  const stalled = new Promise<Response>(() => {});
  const fetcher = vi.fn(async () => phase === "headers" ? stalled : new Response(new ReadableStream({ start() {} })));
  const client = new EevoSystemOneClient(fetcher);
  const rejected = expect(client.evaluate({ model: "eevo-1", state: {}, questions: {} })).rejects.toMatchObject({
    name: "EevoRequestError", category: "timeout", requestFailure: { phase },
  });
  await vi.advanceTimersByTimeAsync(60_000);
  await rejected;
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]).toBeDefined();
});

it("missing Eevo credentials never use Jev credentials", async () => {
  vi.stubEnv("EEVO_API_KEY", "");
  vi.stubEnv("TYPESAFE_API_KEY", "jev-secret");
  vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
  const fetcher = vi.fn();
  await expect(new EevoSystemOneClient(fetcher).evaluate({ model: "eevo-1", state: {}, questions: {} })).rejects.toMatchObject({ name: "EevoRequestError" });
  expect(fetcher).not.toHaveBeenCalled();
});
