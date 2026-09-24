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
});
