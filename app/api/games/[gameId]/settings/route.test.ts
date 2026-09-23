import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "./route";
import { publishGameEvent } from "@/lib/realtime/publish";

const { updateTableSettingsMock } = vi.hoisted(() => ({
  updateTableSettingsMock: vi.fn(),
}));

vi.mock("@/lib/poker/game-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/poker/game-service")>()),
  updateTableSettings: (...args: unknown[]) => updateTableSettingsMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseGameRepository: vi.fn(() => ({ updateTableSettings: vi.fn() })),
}));

vi.mock("@/lib/realtime/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/realtime/publish")>()),
  publishGameEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("PATCH /api/games/[gameId]/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid blind relationships", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/games/game-1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 1,
          seatCount: 2,
          smallBlind: 100,
          bigBlind: 50,
          startingStack: 10_000,
        }),
      }),
      { params: Promise.resolve({ gameId: "game-1" }) },
    );

    expect(response.status).toBe(400);
    expect(updateTableSettingsMock).not.toHaveBeenCalled();
  });

  it("forwards valid settings and broadcasts the new version", async () => {
    const game = {
      id: "game-1",
      status: "waiting",
      version: 2,
      poker: { legalActions: [], players: [] },
    };
    updateTableSettingsMock.mockResolvedValue(game);

    const response = await PATCH(
      new Request("http://localhost/api/games/game-1/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: "ai-holdem-player-id=host-token",
        },
        body: JSON.stringify({
          expectedVersion: 1,
          seatCount: 4,
          smallBlind: 25,
          bigBlind: 50,
          startingStack: 5_000,
        }),
      }),
      { params: Promise.resolve({ gameId: "game-1" }) },
    );

    expect(response.status).toBe(200);
    expect(updateTableSettingsMock).toHaveBeenCalledWith(
      expect.any(Object),
      "game-1",
      1,
      { seatCount: 4, smallBlind: 25, bigBlind: 50, startingStack: 5_000 },
      "host-token",
    );
    expect(publishGameEvent).toHaveBeenCalledWith(
      "game-1",
      "table_settings_updated",
      2,
      expect.any(Object),
    );
  });
});
