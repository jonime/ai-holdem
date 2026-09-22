import { describe, expect, it, vi } from "vitest";

import {
  createDemoGame,
  GameNotFoundError,
  getPublicGame,
} from "./game-service";
import { createDeterministicDeck, pokerEngineAdapter } from "./adapter";

describe("createDemoGame", () => {
  it("creates and persists a shuffled heads-up starting hand", async () => {
    const createGameSession = vi.fn().mockResolvedValue({
      id: "game-1",
      status: "playing",
      currentState: {},
      stateSchemaVersion: 1,
      handNumber: 1,
      version: 0,
    });

    const game = await createDemoGame({ createGameSession });

    expect(game).toMatchObject({ gameId: "game-1", version: 0 });
    expect(pokerEngineAdapter.snapshot(game.state)).toMatchObject({
      handNumber: 1,
      street: "preflop",
      currentActorId: "human",
    });
    expect(createGameSession).toHaveBeenCalledWith(
      expect.objectContaining({
        handNumber: 1,
        status: "playing",
        players: expect.arrayContaining([
          expect.objectContaining({
            enginePlayerId: "human",
            controller: "human",
          }),
          expect.objectContaining({
            enginePlayerId: "typesafe-ai",
            controller: "typesafe_ai",
          }),
        ]),
      }),
    );
  });
});

describe("getPublicGame", () => {
  it("returns only the human's private cards", async () => {
    const state = pokerEngineAdapter.startHand(
      pokerEngineAdapter.createGame({
        smallBlind: 50,
        bigBlind: 100,
        players: [
          {
            id: "human",
            name: "You",
            controller: "human",
            seat: 0,
            stack: 10_000,
          },
          {
            id: "typesafe-ai",
            name: "TypeSafe AI",
            controller: "typesafe_ai",
            seat: 1,
            stack: 10_000,
          },
        ],
      }),
      createDeterministicDeck(),
    );
    const game = await getPublicGame(
      {
        getGame: vi.fn().mockResolvedValue({
          id: "game-1",
          status: "playing",
          currentState: state,
          stateSchemaVersion: 1,
          handNumber: 1,
          version: 0,
        }),
      },
      "game-1",
    );

    expect(
      game.poker.players.find((player) => player.id === "human")?.holeCards,
    ).toHaveLength(2);
    expect(
      game.poker.players.find((player) => player.id === "typesafe-ai")
        ?.holeCards,
    ).toBeNull();
  });

  it("rejects unknown games", async () => {
    await expect(
      getPublicGame({ getGame: vi.fn().mockResolvedValue(null) }, "missing"),
    ).rejects.toBeInstanceOf(GameNotFoundError);
  });
});

describe("submitHumanAction", () => {
  it("validates and persists one human action", async () => {
    const state = pokerEngineAdapter.startHand(
      pokerEngineAdapter.createGame({
        smallBlind: 50,
        bigBlind: 100,
        players: [
          {
            id: "human",
            name: "You",
            controller: "human",
            seat: 0,
            stack: 10_000,
          },
          {
            id: "typesafe-ai",
            name: "TypeSafe AI",
            controller: "typesafe_ai",
            seat: 1,
            stack: 10_000,
          },
        ],
      }),
      createDeterministicDeck(),
    );
    const persistHumanAction = vi.fn().mockResolvedValue({
      id: "game-1",
      status: "playing",
      currentState: {},
      stateSchemaVersion: 1,
      handNumber: 1,
      version: 1,
    });
    const game = await (
      await import("./game-service")
    ).submitHumanAction(
      {
        getGame: vi.fn().mockResolvedValue({
          id: "game-1",
          status: "playing",
          currentState: state,
          stateSchemaVersion: 1,
          handNumber: 1,
          version: 0,
        }),
        persistHumanAction,
      },
      "game-1",
      {
        expectedVersion: 0,
        playerId: "human",
        action: { type: "call", amount: 50 },
      },
    );

    expect(game.version).toBe(1);
    expect(game.poker.currentActorId).toBe("typesafe-ai");
    expect(persistHumanAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "call",
        amount: 50,
        expectedVersion: 0,
      }),
    );
  });
});
