import { beforeEach, describe, expect, it, vi } from "vitest";

const { updatePlayerNameMock, publishSeatEventMock } = vi.hoisted(() => ({
  updatePlayerNameMock: vi.fn(),
  publishSeatEventMock: vi.fn(),
}));

vi.mock("@/lib/poker/game-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/poker/game-service")>()),
  updatePlayerName: (...args: unknown[]) => updatePlayerNameMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseGameRepository: vi.fn(() => ({})),
}));

vi.mock("@/lib/realtime/publish", () => ({
  publishSeatEvent: (...args: unknown[]) => publishSeatEventMock(...args),
}));

import { PATCH } from "./route";

describe("PATCH /api/games/[gameId]/seats/[seat]/name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the owned seat name and broadcasts it", async () => {
    const assignment = {
      gameId: "game-1",
      seat: 0,
      name: "Ada",
      status: "claimed",
      controller: "human",
      playerToken: "host-token",
      isHost: true,
    };
    updatePlayerNameMock.mockResolvedValue(assignment);

    const response = await PATCH(
      new Request("http://localhost/api/games/game-1/seats/0/name", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: "ai-holdem-player-id=host-token",
        },
        body: JSON.stringify({ name: "Ada" }),
      }),
      { params: Promise.resolve({ gameId: "game-1", seat: "0" }) },
    );

    expect(response.status).toBe(200);
    expect(updatePlayerNameMock).toHaveBeenCalledWith(
      expect.any(Object),
      "game-1",
      0,
      "host-token",
      "Ada",
    );
    expect(publishSeatEventMock).toHaveBeenCalledWith(
      "game-1",
      "seat_name_updated",
      assignment,
    );
  });

  it("rejects a malformed name", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/games/game-1/seats/0/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: 42 }),
      }),
      { params: Promise.resolve({ gameId: "game-1", seat: "0" }) },
    );

    expect(response.status).toBe(400);
    expect(updatePlayerNameMock).not.toHaveBeenCalled();
  });

  it("maps ownership and started-game conflicts", async () => {
    updatePlayerNameMock.mockRejectedValueOnce(
      new Error("Seat does not belong to this player"),
    );
    const forbidden = await PATCH(
      new Request("http://localhost/api/games/game-1/seats/0/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ada" }),
      }),
      { params: Promise.resolve({ gameId: "game-1", seat: "0" }) },
    );
    expect(forbidden.status).toBe(403);

    updatePlayerNameMock.mockRejectedValueOnce(
      new Error("Player names can only be changed before the game starts"),
    );
    const conflict = await PATCH(
      new Request("http://localhost/api/games/game-1/seats/0/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ada" }),
      }),
      { params: Promise.resolve({ gameId: "game-1", seat: "0" }) },
    );
    expect(conflict.status).toBe(409);
  });
});
