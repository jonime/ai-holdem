import { afterEach, describe, expect, it, vi } from "vitest";

import { TypesafeSystemOneClient } from "./client";

const originalApiKey = process.env.TYPESAFE_API_KEY;

afterEach(() => {
  process.env.TYPESAFE_API_KEY = originalApiKey;
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
});
