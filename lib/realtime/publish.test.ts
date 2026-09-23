import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  publishGameEvent,
  toBroadcastGame,
  toBroadcastSeat,
  type BroadcastGame,
} from "./publish";

const { createSupabaseServerClientMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseGameRepository: vi.fn(),
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

const game = {
  id: "game-1",
  status: "playing" as const,
  version: 2,
  poker: {
    handNumber: 1,
    seatCount: 2,
    smallBlind: 50,
    bigBlind: 100,
    startingStack: 10_000,
    street: "preflop" as const,
    dealerSeat: 0,
    smallBlindSeat: 0,
    bigBlindSeat: 1,
    currentActorId: "human",
    communityCards: [],
    pot: 150,
    completionReason: null,
    winnerIds: [],
    winnerAmounts: {},
    legalActions: [{ type: "check" as const }],
    players: [
      {
        id: "human",
        name: "Player",
        controller: "human" as const,
        aiDifficulty: null,
        seat: 0,
        status: "claimed" as const,
        playerToken: "secret-token",
        isHost: true,
        leaving: false,
        inHand: true,
        stack: 10_000,
        folded: false,
        allIn: false,
        holeCards: ["As", "Kd"],
      },
    ],
  },
};

describe("publishGameEvent", () => {
  const send = vi.fn();
  const removeChannel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue("ok");
    removeChannel.mockResolvedValue(undefined);
    createSupabaseServerClientMock.mockReturnValue({
      channel: vi.fn(() => ({ send })),
      removeChannel,
    });
  });

  it("sends only a validated masked event and removes its channel", async () => {
    const result = await publishGameEvent("game-1", "player_action", 2, {
      game: toBroadcastGame(game),
    });

    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "player_action",
      payload: expect.objectContaining({
        gameId: "game-1",
        version: 2,
        game: expect.objectContaining({
          poker: expect.objectContaining({
            legalActions: [],
            players: [
              expect.objectContaining({
                playerToken: null,
                holeCards: null,
              }),
            ],
          }),
        }),
      }),
    });
    expect(removeChannel).toHaveBeenCalledOnce();
  });

  it("reports invalid private payloads without creating a channel", async () => {
    const result = await publishGameEvent("game-1", "player_action", 2, {
      game: game as unknown as BroadcastGame,
    });

    expect(result.ok).toBe(false);
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("removes private seat assignment fields", () => {
    expect(
      toBroadcastSeat({
        gameId: "game-1",
        seat: 1,
        name: "Player",
        status: "claimed",
        controller: "human",
        aiDifficulty: null,
        playerToken: "secret-token",
        isHost: false,
        leaving: false,
        enginePlayerId: "internal-player",
      }),
    ).toEqual({
      gameId: "game-1",
      seat: 1,
      name: "Player",
      status: "claimed",
      controller: "human",
      aiDifficulty: null,
      playerToken: null,
      isHost: false,
      leaving: false,
    });
  });

  it.each([
    ["non-ok send", () => send.mockResolvedValue("timed out")],
    ["thrown send", () => send.mockRejectedValue(new Error("offline"))],
  ])("reports %s while still cleaning up", async (_name, arrange) => {
    arrange();

    const result = await publishGameEvent("game-1", "player_action", 2, {
      game: toBroadcastGame(game),
    });

    expect(result.ok).toBe(false);
    expect(removeChannel).toHaveBeenCalledOnce();
  });
});
