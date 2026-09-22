import { describe, expect, it, vi } from "vitest";

import {
  createDemoGame,
  GameNotFoundError,
  getPublicGame,
  stepTypesafeAction,
  startNextHand,
  submitHumanAction,
} from "./game-service";
import { createDeterministicDeck, pokerEngineAdapter } from "./adapter";
import type {
  PersistAIActionInput,
  PersistedGame,
  PersistHumanActionInput,
} from "@/lib/supabase/queries";
import type { SystemOneRequest } from "@/lib/typesafe/types";

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

  it("supports custom seat counts while preserving the default host and bot setup", async () => {
    const createGameSession = vi.fn().mockResolvedValue({
      id: "game-1",
      status: "playing",
      currentState: {},
      stateSchemaVersion: 1,
      handNumber: 1,
      version: 0,
    });

    await createDemoGame(
      { createGameSession },
      { seatCount: 3, hostToken: "host-token" },
    );

    expect(createGameSession).toHaveBeenCalledWith(
      expect.objectContaining({
        players: expect.arrayContaining([
          expect.objectContaining({
            enginePlayerId: "human",
            seat: 0,
            status: "claimed",
            playerToken: "host-token",
            isHost: true,
          }),
          expect.objectContaining({
            enginePlayerId: "typesafe-ai",
            seat: 1,
            status: "bot",
          }),
        ]),
      }),
    );
    expect(
      createGameSession.mock.calls[0][0].currentState.config.seatCount,
    ).toBe(3);
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

describe("startNextHand", () => {
  it("rejects starting a next hand when an open seat remains unfilled", async () => {
    const completedState = pokerEngineAdapter.applyAction(
      pokerEngineAdapter.startHand(
        pokerEngineAdapter.createGame({
          smallBlind: 50,
          bigBlind: 100,
          seatCount: 3,
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
      ),
      "human",
      { type: "fold" },
    );

    await expect(
      startNextHand(
        {
          getGame: vi.fn().mockResolvedValue({
            id: "game-1",
            status: "complete",
            currentState: completedState,
            stateSchemaVersion: 1,
            handNumber: 1,
            version: 1,
          }),
          startNextHand: vi.fn(),
        },
        "game-1",
        1,
      ),
    ).rejects.toThrow("Waiting for players");
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

describe("stepTypesafeAction", () => {
  it("applies and persists one validated AI action", async () => {
    const started = pokerEngineAdapter.startHand(
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
    const aiTurn = pokerEngineAdapter.applyAction(started, "human", {
      type: "call",
      amount: 50,
    });
    const persistAIAction = vi.fn().mockResolvedValue({
      id: "game-1",
      status: "playing",
      currentState: {},
      stateSchemaVersion: 1,
      handNumber: 1,
      version: 2,
    });

    const game = await stepTypesafeAction(
      {
        getGame: vi.fn().mockResolvedValue({
          id: "game-1",
          status: "playing",
          currentState: aiTurn,
          stateSchemaVersion: 1,
          handNumber: 1,
          version: 1,
        }),
        persistAIAction,
      },
      {
        evaluate: async () => ({
          answers: {
            action: {
              type: "choice",
              choice: "check",
              probabilities: { fold: 0, check: 1, raise: 0 },
              confidence: 1,
            },
            sizing: {
              type: "choice",
              choice: "small",
              probabilities: { small: 1, medium: 0, large: 0, all_in: 0 },
              confidence: 1,
            },
          },
        }),
      },
      "game-1",
    );

    expect(game.game.version).toBe(2);
    expect(game.game.poker.currentActorId).toBe("typesafe-ai");
    expect(game.aiDecision.action).toBe("check");
    expect(persistAIAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check", choice: "check" }),
    );
  });

  it("rejects attempts to step a human turn", async () => {
    const humanTurn = pokerEngineAdapter.startHand(
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
    await expect(
      stepTypesafeAction(
        {
          getGame: vi.fn().mockResolvedValue({
            id: "game-1",
            status: "playing",
            currentState: humanTurn,
            stateSchemaVersion: 1,
            handNumber: 1,
            version: 0,
          }),
          persistAIAction: vi.fn(),
        },
        { evaluate: vi.fn() },
        "game-1",
      ),
    ).rejects.toThrow("not a TypeSafe AI turn");
  });
});

describe("startNextHand", () => {
  it("persists a fresh preflop hand after completion", async () => {
    const completedState = pokerEngineAdapter.applyAction(
      pokerEngineAdapter.startHand(
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
      ),
      "human",
      { type: "fold" },
    );
    const startNextHandWriter = vi.fn().mockResolvedValue({
      id: "game-1",
      status: "playing",
      currentState: {},
      stateSchemaVersion: 1,
      handNumber: 2,
      version: 2,
    });

    const game = await startNextHand(
      {
        getGame: vi.fn().mockResolvedValue({
          id: "game-1",
          status: "complete",
          currentState: completedState,
          stateSchemaVersion: 1,
          handNumber: 1,
          version: 1,
        }),
        startNextHand: startNextHandWriter,
      },
      "game-1",
      1,
    );

    expect(game).toMatchObject({ version: 2, status: "playing" });
    expect(game.poker).toMatchObject({
      handNumber: 2,
      street: "preflop",
      communityCards: [],
    });
    expect(startNextHandWriter).toHaveBeenCalledWith(
      expect.objectContaining({ handNumber: 2, expectedVersion: 1 }),
    );
  });
});

describe("deterministic persisted hand harness", () => {
  it("completes a full heads-up showdown through human and TypeSafe service turns", async () => {
    const startedState = pokerEngineAdapter.startHand(
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
    let storedGame: PersistedGame = {
      id: "game-1",
      status: "playing",
      currentState: startedState,
      stateSchemaVersion: 1,
      handNumber: 1,
      version: 0,
    };
    const persistedActions: Array<
      PersistHumanActionInput | PersistAIActionInput
    > = [];

    function persist(
      input: PersistHumanActionInput | PersistAIActionInput,
    ): PersistedGame {
      expect(input.expectedVersion).toBe(storedGame.version);
      persistedActions.push(input);
      storedGame = {
        ...storedGame,
        status: input.status,
        currentState: input.currentState,
        stateSchemaVersion: input.stateSchemaVersion,
        handNumber: input.handNumber,
        version: storedGame.version + 1,
      };
      return storedGame;
    }

    const repository = {
      getGame: async () => storedGame,
      persistHumanAction: async (input: PersistHumanActionInput) =>
        persist(input),
      persistAIAction: async (input: PersistAIActionInput) => persist(input),
    };
    const passiveTypesafeClient = {
      evaluate: async (request: SystemOneRequest) => {
        const actionQuestion = request.questions.action;
        if (!actionQuestion) {
          throw new Error("Expected a TypeSafe action question");
        }
        const options = Object.keys(actionQuestion.criteria);
        const choice = options.includes("check") ? "check" : "call";
        return {
          answers: {
            action: {
              type: "choice",
              choice,
              probabilities: Object.fromEntries(
                options.map((option) => [option, option === choice ? 1 : 0]),
              ),
              confidence: 1,
            },
            sizing: {
              type: "choice",
              choice: "small",
              probabilities: { small: 1, medium: 0, large: 0, all_in: 0 },
              confidence: 1,
            },
          },
        };
      },
    };

    for (let actionCount = 0; actionCount < 20; actionCount += 1) {
      const game = await getPublicGame(repository, "game-1");
      if (game.poker.street === "complete") {
        expect(game.poker.completionReason).toBe("showdown");
        expect(game.poker.communityCards).toHaveLength(5);
        expect(game.poker.winnerIds.length).toBeGreaterThan(0);
        break;
      }

      if (game.poker.currentActorId === "human") {
        const action =
          game.poker.legalActions.find(
            (candidate) => candidate.type === "check",
          ) ??
          game.poker.legalActions.find(
            (candidate) => candidate.type === "call",
          );
        if (!action || (action.type !== "check" && action.type !== "call")) {
          throw new Error("Expected a legal passive human action");
        }
        await submitHumanAction(repository, "game-1", {
          expectedVersion: game.version,
          playerId: "human",
          action,
        });
      } else {
        await stepTypesafeAction(repository, passiveTypesafeClient, "game-1");
      }
    }

    expect(
      pokerEngineAdapter.snapshot(
        storedGame.currentState as Parameters<
          typeof pokerEngineAdapter.restore
        >[0],
      ),
    ).toMatchObject({
      street: "complete",
      completionReason: "showdown",
    });
    expect(persistedActions.length).toBeGreaterThan(0);
    expect(new Set(persistedActions.map((action) => action.street))).toEqual(
      new Set(["preflop", "flop", "turn", "river"]),
    );
    expect(persistedActions.some((action) => "aiState" in action)).toBe(true);
  });
});
