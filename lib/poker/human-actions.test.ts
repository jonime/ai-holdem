import { describe, expect, it } from "vitest";

import { createDeterministicDeck, pokerEngineAdapter } from "./adapter";
import { applyHumanAction, HumanActionError } from "./human-actions";
import type { GameConfig } from "./types";

const gameConfig: GameConfig = {
  smallBlind: 50,
  bigBlind: 100,
  players: [
    { id: "human", name: "You", controller: "human", seat: 0, stack: 10_000 },
    {
      id: "ai",
      name: "TypeSafe AI",
      controller: "typesafe_ai",
      seat: 1,
      stack: 10_000,
    },
  ],
};

function startState() {
  return pokerEngineAdapter.startHand(
    pokerEngineAdapter.createGame(gameConfig),
    createDeterministicDeck(),
  );
}

describe("applyHumanAction", () => {
  it("applies one legal human action", () => {
    const state = startState();
    const nextState = applyHumanAction(state, {
      expectedVersion: 4,
      currentVersion: 4,
      playerId: "human",
      action: { type: "call", amount: 50 },
    });

    expect(pokerEngineAdapter.snapshot(nextState).currentActorId).toBe("ai");
  });

  it("rejects stale submissions before applying an action", () => {
    expect(() =>
      applyHumanAction(startState(), {
        expectedVersion: 3,
        currentVersion: 4,
        playerId: "human",
        action: { type: "call", amount: 50 },
      }),
    ).toThrow(new HumanActionError("Game version is stale"));
  });

  it("rejects AI and out-of-turn submissions", () => {
    const state = startState();

    expect(() =>
      applyHumanAction(state, {
        expectedVersion: 4,
        currentVersion: 4,
        playerId: "ai",
        action: { type: "call", amount: 50 },
      }),
    ).toThrow("Only a human-controlled player");

    const afterHumanAction = applyHumanAction(state, {
      expectedVersion: 4,
      currentVersion: 4,
      playerId: "human",
      action: { type: "call", amount: 50 },
    });
    expect(() =>
      applyHumanAction(afterHumanAction, {
        expectedVersion: 5,
        currentVersion: 5,
        playerId: "human",
        action: { type: "check" },
      }),
    ).toThrow("not this player's turn");
  });

  it("rejects unavailable actions", () => {
    expect(() =>
      applyHumanAction(startState(), {
        expectedVersion: 4,
        currentVersion: 4,
        playerId: "human",
        action: { type: "check" },
      }),
    ).toThrow("Action is not legal: check");
  });
});
