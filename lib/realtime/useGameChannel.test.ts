import { describe, expect, it } from "vitest";

import { realtimeGameEventSchema } from "@/lib/http/schemas";
import { shouldRefreshForGameEvent } from "./useGameChannel";

const seatEvent = realtimeGameEventSchema.parse({
  type: "seat_claimed",
  gameId: "game-1",
  version: 4,
  game: {
    id: "game-1",
    status: "waiting",
    version: 4,
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
});

describe("shouldRefreshForGameEvent", () => {
  it("refreshes newer game events", () => {
    const gameEvent = { ...seatEvent, type: "player_action" as const };
    expect(shouldRefreshForGameEvent(gameEvent, "game-1", 3)).toBe(true);
  });

  it("ignores stale events and events for another game", () => {
    const gameEvent = { ...seatEvent, type: "player_action" as const };
    expect(shouldRefreshForGameEvent(gameEvent, "game-1", 4)).toBe(false);
    expect(shouldRefreshForGameEvent(gameEvent, "game-2", 3)).toBe(false);
  });

  it("refreshes seat events even when their version is stale", () => {
    expect(shouldRefreshForGameEvent(seatEvent, "game-1", 4)).toBe(true);
  });
});
