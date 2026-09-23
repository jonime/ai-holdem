import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { requestJson } from "./request-json";

describe("requestJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses valid payloads with a schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ gameId: "game-1" }),
      }),
    );

    await expect(
      requestJson(
        "/api/games/game-1",
        undefined,
        z.object({ gameId: z.string() }),
      ),
    ).resolves.toEqual({ gameId: "game-1" });
  });

  it("rejects malformed successful JSON with a user-safe message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("bad json");
        },
      }),
    );

    await expect(
      requestJson(
        "/api/games/game-1",
        undefined,
        z.object({ gameId: z.string() }),
      ),
    ).rejects.toThrow("Invalid response payload");
  });

  it("rejects schema validation failures for successful payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ gameId: 37 }),
      }),
    );

    await expect(
      requestJson(
        "/api/games/game-1",
        undefined,
        z.object({ gameId: z.string() }),
      ),
    ).rejects.toThrow("Invalid response payload");
  });

  it("uses the server error message for non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Nope" }),
      }),
    );

    await expect(requestJson("/api/games/game-1")).rejects.toThrow("Nope");
  });
});
