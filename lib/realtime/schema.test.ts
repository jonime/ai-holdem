import { describe, expect, it } from "vitest";

import { realtimeGameEventSchema } from "@/lib/http/schemas";

const event = {
  type: "seat_claimed",
  gameId: "game-1",
  version: 3,
  game: {
    id: "game-1",
    status: "waiting",
    version: 3,
    viewerIsHost: false,
    poker: {
      handNumber: 0,
      seatCount: 2,
      smallBlind: 50,
      bigBlind: 100,
      startingStack: 10_000,
      street: null,
      dealerSeat: null,
      smallBlindSeat: null,
      bigBlindSeat: null,
      currentActorId: null,
      communityCards: [],
      pot: 0,
      completionReason: null,
      winnerIds: [],
      winnerAmounts: {},
      legalActions: [],
      players: [],
    },
  },
  seat: {
    gameId: "game-1",
    seat: 1,
    status: "claimed",
    controller: "human",
    playerToken: null,
    isHost: false,
  },
};

describe("realtimeGameEventSchema", () => {
  it("accepts a valid seat event", () => {
    expect(realtimeGameEventSchema.safeParse(event).success).toBe(true);
  });

  it.each([
    ["unknown event", { ...event, type: "unrecognized" }],
    ["unsafe version", { ...event, version: Number.MAX_SAFE_INTEGER + 1 }],
    ["unmasked token", { ...event, seat: { ...event.seat, playerToken: "x" } }],
    ["extra envelope field", { ...event, privateState: "private" }],
    [
      "extra private seat state",
      { ...event, seat: { ...event.seat, enginePlayerId: "private" } },
    ],
  ])("rejects %s", (_name, invalidEvent) => {
    expect(realtimeGameEventSchema.safeParse(invalidEvent).success).toBe(false);
  });
});
