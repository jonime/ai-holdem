import { describe, expect, it, vi } from "vitest";

import {
  assignBotToSeat,
  claimSeat,
  createDemoGame,
  GameNotFoundError,
  getGameFeed,
  getPublicGame,
  releaseSeat,
  stepTypesafeAction,
  startGame,
  startNextHand,
  submitHumanAction,
  updateSeatCount,
  updatePlayerName,
  updateTableSettings,
  validateTableSettings,
} from "./game-service";
import { createDeterministicDeck, pokerEngineAdapter } from "./adapter";
import type {
  PersistAIActionInput,
  PersistedGame,
  PersistHumanActionInput,
} from "@/lib/supabase/queries";
import type { SystemOneRequest } from "@/lib/typesafe/types";

describe("createDemoGame", () => {
  it("creates and persists a waiting lobby with the host seated", async () => {
    const createGameSession = vi.fn().mockResolvedValue({
      id: "game-1",
      status: "waiting",
      currentState: {},
      stateSchemaVersion: 1,
      handNumber: 1,
      version: 0,
    });

    const game = await createDemoGame({ createGameSession });

    expect(game).toMatchObject({ gameId: "game-1", version: 0 });
    expect(pokerEngineAdapter.snapshot(game.state)).toMatchObject({
      handNumber: 0,
      street: null,
      currentActorId: null,
    });
    expect(createGameSession).toHaveBeenCalledWith(
      expect.objectContaining({
        handNumber: 0,
        status: "waiting",
        players: expect.arrayContaining([
          expect.objectContaining({
            enginePlayerId: "human",
            controller: "human",
            name: "Player 1",
          }),
          expect.objectContaining({
            enginePlayerId: null,
            seat: 1,
            status: "open",
          }),
        ]),
      }),
    );
  });

  it("supports custom seat counts with open placeholder seats", async () => {
    const createGameSession = vi.fn().mockResolvedValue({
      id: "game-1",
      status: "waiting",
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
            enginePlayerId: null,
            seat: 1,
            status: "open",
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
            playerToken: "viewer-token",
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
    const seatedGame = await getPublicGame(
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
      "viewer-token",
    );
    const spectatorGame = await getPublicGame(
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
      "other-token",
    );

    expect(
      seatedGame.poker.players.find((player) => player.id === "human")
        ?.holeCards,
    ).toHaveLength(2);
    expect(
      seatedGame.poker.players.find((player) => player.id === "typesafe-ai")
        ?.holeCards,
    ).toBeNull();
    expect(
      spectatorGame.poker.players.every((player) => player.holeCards === null),
    ).toBe(true);
  });

  it("projects a released seat from the authoritative assignment", async () => {
    const state = pokerEngineAdapter.createGame({
      smallBlind: 50,
      bigBlind: 100,
      seatCount: 2,
      players: [
        {
          id: "human",
          name: "Host",
          controller: "human",
          seat: 0,
          stack: 10_000,
          status: "claimed",
          playerToken: "host-token",
          isHost: true,
        },
      ],
    });
    const game = await getPublicGame(
      {
        getGame: vi.fn().mockResolvedValue({
          id: "game-1",
          status: "waiting",
          currentState: state,
          stateSchemaVersion: 1,
          handNumber: 0,
          version: 0,
        }),
        getHostToken: vi.fn().mockResolvedValue("host-token"),
        getSeatAssignments: vi.fn().mockResolvedValue([
          {
            gameId: "game-1",
            seat: 0,
            name: "Host",
            status: "open",
            controller: "human",
            aiDifficulty: null,
            playerToken: null,
            isHost: false,
            leaving: false,
            enginePlayerId: "human",
          },
        ]),
      },
      "game-1",
      "host-token",
    );

    expect(game.viewerIsHost).toBe(true);
    expect(game.poker.players[0]).toMatchObject({
      status: "open",
      playerToken: null,
      isHost: false,
    });
  });

  it("projects a moved host claim and opens the original configured seat", async () => {
    const state = pokerEngineAdapter.createGame({
      smallBlind: 50,
      bigBlind: 100,
      seatCount: 2,
      players: [
        {
          id: "human",
          name: "Host",
          controller: "human",
          seat: 0,
          stack: 10_000,
          status: "claimed",
          playerToken: "host-token",
          isHost: true,
        },
      ],
    });
    const game = await getPublicGame(
      {
        getGame: vi.fn().mockResolvedValue({
          id: "game-1",
          status: "waiting",
          currentState: state,
          stateSchemaVersion: 1,
          handNumber: 0,
          version: 0,
        }),
        getHostToken: vi.fn().mockResolvedValue("host-token"),
        getSeatAssignments: vi.fn().mockResolvedValue([
          {
            gameId: "game-1",
            seat: 0,
            name: "Seat 1",
            status: "open",
            controller: "human",
            aiDifficulty: null,
            playerToken: null,
            isHost: false,
            leaving: false,
            enginePlayerId: null,
          },
          {
            gameId: "game-1",
            seat: 1,
            name: "Host",
            status: "claimed",
            controller: "human",
            aiDifficulty: null,
            playerToken: "host-token",
            isHost: true,
            leaving: false,
            enginePlayerId: "human",
          },
        ]),
      },
      "game-1",
      "host-token",
    );

    expect(game.viewerIsHost).toBe(true);
    expect(game.poker.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          seat: 0,
          status: "open",
          playerToken: null,
          isHost: false,
        }),
        expect.objectContaining({
          id: "human",
          seat: 1,
          status: "claimed",
          playerToken: "host-token",
          isHost: true,
        }),
      ]),
    );
  });

  it("rejects malformed persisted state without leaking unchecked casts", async () => {
    await expect(
      getPublicGame(
        {
          getGame: vi.fn().mockResolvedValue({
            id: "game-1",
            status: "playing",
            currentState: {
              stateSchemaVersion: 1,
              config: {},
              engineState: {},
            },
            stateSchemaVersion: 1,
            handNumber: 1,
            version: 0,
          }),
        },
        "game-1",
      ),
    ).rejects.toThrow("Malformed persisted game state");
  });

  it("rejects unknown games", async () => {
    await expect(
      getPublicGame({ getGame: vi.fn().mockResolvedValue(null) }, "missing"),
    ).rejects.toBeInstanceOf(GameNotFoundError);
  });
});

describe("startNextHand", () => {
  it("starts a next hand with the currently filled seats", async () => {
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

    const startNextHandWriter = vi.fn().mockResolvedValue({
      id: "game-1",
      status: "playing",
      currentState: {},
      stateSchemaVersion: 1,
      handNumber: 2,
      version: 2,
    });
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
          startNextHand: startNextHandWriter,
        },
        "game-1",
        1,
      ),
    ).resolves.toMatchObject({ status: "playing" });
  });
});

describe("claimSeat", () => {
  it("claims an open seat for the calling player token", async () => {
    const getSeatAssignments = vi.fn().mockResolvedValue([
      { seat: 0, status: "claimed", playerToken: "host-token", isHost: true },
      { seat: 1, status: "bot", playerToken: null, isHost: false },
      { seat: 2, status: "open", playerToken: null, isHost: false },
    ]);
    const updateSeatAssignment = vi.fn().mockResolvedValue(undefined);

    await claimSeat(
      {
        getSeatAssignments,
        updateSeatAssignment,
      },
      "game-1",
      2,
      "player-token",
    );

    expect(updateSeatAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "game-1",
        seat: 2,
        status: "claimed",
        playerToken: "player-token",
        isHost: false,
      }),
    );
  });

  it("rejects claiming a seat that is already claimed or occupied by a bot", async () => {
    const getSeatAssignments = vi.fn().mockResolvedValue([
      { seat: 0, status: "claimed", playerToken: "host-token", isHost: true },
      { seat: 1, status: "bot", playerToken: null, isHost: false },
    ]);

    await expect(
      claimSeat(
        { getSeatAssignments, updateSeatAssignment: vi.fn() },
        "game-1",
        1,
        "player-token",
      ),
    ).rejects.toThrow("Seat is not open");
  });

  it("moves an existing player claim to a different open seat", async () => {
    const getSeatAssignments = vi.fn().mockResolvedValue([
      {
        seat: 0,
        name: "Ada",
        status: "claimed",
        playerToken: "player-token",
        isHost: true,
        enginePlayerId: "human",
      },
      { seat: 1, status: "open", playerToken: null, isHost: false },
    ]);
    const updateSeatAssignment = vi.fn().mockResolvedValue(undefined);

    const assignment = await claimSeat(
      { getSeatAssignments, updateSeatAssignment },
      "game-1",
      1,
      "player-token",
    );

    expect(updateSeatAssignment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        gameId: "game-1",
        seat: 0,
        status: "open",
        playerToken: null,
        isHost: false,
        enginePlayerId: null,
      }),
    );
    expect(updateSeatAssignment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        gameId: "game-1",
        seat: 1,
        status: "claimed",
        name: "Ada",
        playerToken: "player-token",
        isHost: true,
        enginePlayerId: "human",
      }),
    );
    expect(assignment).toEqual(
      expect.objectContaining({
        seat: 1,
        status: "claimed",
        name: "Ada",
        playerToken: "player-token",
        isHost: true,
        enginePlayerId: "human",
      }),
    );
  });
});

describe("updatePlayerName", () => {
  const waitingGame: PersistedGame = {
    id: "game-1",
    status: "waiting",
    currentState: {},
    stateSchemaVersion: 1,
    handNumber: 0,
    version: 0,
  };
  const ownedSeat = {
    gameId: "game-1",
    seat: 1,
    name: "Player 2",
    status: "claimed" as const,
    controller: "human" as const,
    playerToken: "player-token",
    isHost: false,
  };

  it("updates the owned human seat and normalizes the name", async () => {
    const updateSeatAssignment = vi.fn().mockResolvedValue(undefined);
    const assignment = await updatePlayerName(
      {
        getGame: vi.fn().mockResolvedValue(waitingGame),
        getSeatAssignments: vi.fn().mockResolvedValue([ownedSeat]),
        updateSeatAssignment,
      },
      "game-1",
      1,
      "player-token",
      "  Ada  ",
    );

    expect(assignment.name).toBe("Ada");
    expect(updateSeatAssignment).toHaveBeenCalledWith({
      gameId: "game-1",
      seat: 1,
      status: "claimed",
      name: "Ada",
    });
  });

  it("uses the seat fallback for an empty name", async () => {
    const updateSeatAssignment = vi.fn().mockResolvedValue(undefined);
    const assignment = await updatePlayerName(
      {
        getGame: vi.fn().mockResolvedValue(waitingGame),
        getSeatAssignments: vi.fn().mockResolvedValue([ownedSeat]),
        updateSeatAssignment,
      },
      "game-1",
      1,
      "player-token",
      "   ",
    );

    expect(assignment.name).toBe("Player 2");
  });

  it("rejects another player's seat and games that have started", async () => {
    const repository = {
      getGame: vi.fn().mockResolvedValue(waitingGame),
      getSeatAssignments: vi.fn().mockResolvedValue([ownedSeat]),
      updateSeatAssignment: vi.fn(),
    };

    await expect(
      updatePlayerName(repository, "game-1", 1, "other-token", "Grace"),
    ).rejects.toThrow("Seat does not belong to this player");

    repository.getGame.mockResolvedValue({
      ...waitingGame,
      status: "playing",
    });
    await expect(
      updatePlayerName(repository, "game-1", 1, "player-token", "Grace"),
    ).rejects.toThrow("Player names can only be changed before the game starts");
  });
});

describe("assignBotToSeat", () => {
  it("allows the host to assign a bot to an open seat", async () => {
    const getSeatAssignments = vi.fn().mockResolvedValue([
      { seat: 0, status: "claimed", playerToken: "host-token", isHost: true },
      { seat: 1, status: "open", playerToken: null, isHost: false },
    ]);
    const updateSeatAssignment = vi.fn().mockResolvedValue(undefined);

    await assignBotToSeat(
      {
        getSeatAssignments,
        updateSeatAssignment,
      },
      "game-1",
      1,
      "host-token",
      "hard",
    );

    expect(updateSeatAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "game-1",
        seat: 1,
        status: "bot",
        controller: "bot",
        aiDifficulty: "hard",
        playerToken: null,
      }),
    );
  });

  it("allows a seatless game host to assign a bot", async () => {
    const updateSeatAssignment = vi.fn().mockResolvedValue(undefined);
    const repository = {
      getHostToken: vi.fn().mockResolvedValue("host-token"),
      getSeatAssignments: vi.fn().mockResolvedValue([
        { seat: 0, status: "open", playerToken: null, isHost: false },
        { seat: 1, status: "open", playerToken: null, isHost: false },
      ]),
      updateSeatAssignment,
    };

    await assignBotToSeat(repository, "game-1", 0, "host-token");

    expect(updateSeatAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ seat: 0, status: "bot" }),
    );
    await expect(
      assignBotToSeat(repository, "game-1", 1, "spectator-token"),
    ).rejects.toThrow("Only the host can assign bots");
  });

  it("preserves rules difficulty after rehydrating a saved game", async () => {
    const state = pokerEngineAdapter.createGame({
      smallBlind: 50,
      bigBlind: 100,
      seatCount: 2,
      players: [
        {
          id: "human",
          name: "You",
          controller: "human",
          seat: 0,
          stack: 10_000,
          status: "claimed",
          playerToken: "host-token",
          isHost: true,
        },
        {
          id: "rules-bot",
          name: "Equity Rules",
          controller: "bot",
          seat: 1,
          stack: 10_000,
          status: "bot",
          bot: {
            id: "equity-rules-v2",
            label: "Equity Rules",
            provider: "rules",
            modelId: null,
          },
          aiDifficulty: "hard",
          playerToken: null,
          isHost: false,
        },
      ],
    });

    const publicGame = await getPublicGame(
      {
        getGame: vi.fn().mockResolvedValue({
          id: "game-1",
          status: "waiting",
          currentState: state,
          stateSchemaVersion: 1,
          handNumber: 0,
          version: 0,
        }),
        getHostToken: vi.fn().mockResolvedValue("host-token"),
        getSeatAssignments: vi.fn().mockResolvedValue([
          {
            gameId: "game-1",
            seat: 0,
            name: "You",
            status: "claimed",
            controller: "human",
            aiDifficulty: null,
            playerToken: "host-token",
            isHost: true,
            leaving: false,
            enginePlayerId: "human",
          },
          {
            gameId: "game-1",
            seat: 1,
            name: "Equity Rules",
            status: "bot",
            controller: "bot",
            bot: {
              id: "equity-rules-v2",
              label: "Equity Rules",
              provider: "rules",
              modelId: null,
            },
            aiDifficulty: "hard",
            playerToken: null,
            isHost: false,
            leaving: false,
            enginePlayerId: "rules-bot",
          },
        ]),
      },
      "game-1",
      "host-token",
    );

    expect(
      publicGame.poker.players.find((player) => player.seat === 1),
    ).toMatchObject({
      aiDifficulty: "hard",
      bot: expect.objectContaining({ provider: "rules" }),
    });
  });

  it("persists difficulty for rules bots and keeps OpenRouter null", async () => {
    const updateSeatAssignment = vi.fn().mockResolvedValue(undefined);
    const repository = {
      getSeatAssignments: vi.fn().mockResolvedValue([
        { seat: 0, status: "claimed", playerToken: "host-token", isHost: true },
        { seat: 1, status: "open", playerToken: null, isHost: false },
        { seat: 2, status: "open", playerToken: null, isHost: false },
      ]),
      updateSeatAssignment,
    };

    await assignBotToSeat(repository, "game-1", 1, "host-token", "hard", {
      id: "equity-rules-v2",
      label: "Equity Rules v2",
      provider: "rules",
      modelId: null,
    });

    expect(updateSeatAssignment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        seat: 1,
        status: "bot",
        aiDifficulty: "hard",
        bot: expect.objectContaining({ provider: "rules" }),
      }),
    );

    await assignBotToSeat(repository, "game-1", 2, "host-token", "hard", {
      id: "openrouter-gpt-4o-mini",
      label: "OpenRouter GPT",
      provider: "openrouter",
      modelId: "gpt-4o-mini",
    });

    expect(updateSeatAssignment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        seat: 2,
        status: "bot",
        aiDifficulty: null,
        bot: expect.objectContaining({ provider: "openrouter" }),
      }),
    );
  });
});

describe("releaseSeat", () => {
  it("clears difficulty when a host removes a bot between hands", async () => {
    const updateSeatAssignment = vi.fn().mockResolvedValue(undefined);
    await releaseSeat(
      {
        getSeatAssignments: vi.fn().mockResolvedValue([
          {
            seat: 0,
            status: "claimed",
            controller: "human",
            playerToken: "host-token",
            isHost: true,
          },
          {
            seat: 1,
            name: "TypeSafe AI #1",
            status: "bot",
            controller: "typesafe_ai",
            aiDifficulty: "hard",
            playerToken: null,
            isHost: false,
          },
        ]),
        updateSeatAssignment,
      },
      "game-1",
      1,
      "host-token",
    );

    expect(updateSeatAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "open",
        name: "Seat 2",
        controller: "human",
        aiDifficulty: null,
      }),
    );
  });
});

describe("updateSeatCount", () => {
  function waitingGame(seatCount: number) {
    return {
      id: "game-1",
      status: "waiting" as const,
      currentState: pokerEngineAdapter.createGame({
        smallBlind: 50,
        bigBlind: 100,
        seatCount,
        players: [
          {
            id: "human",
            name: "You",
            controller: "human",
            seat: 0,
            stack: 10_000,
            status: "claimed",
            playerToken: "host-token",
            isHost: true,
          },
        ],
      }),
      stateSchemaVersion: 1,
      handNumber: 0,
      version: 0,
    };
  }

  it("lets the host resize the table and persists the new config", async () => {
    const getGame = vi.fn().mockResolvedValue(waitingGame(4));
    const getSeatAssignments = vi.fn().mockResolvedValue([
      { seat: 0, status: "claimed", playerToken: "host-token", isHost: true },
      { seat: 1, status: "open", playerToken: null, isHost: false },
      { seat: 2, status: "open", playerToken: null, isHost: false },
      { seat: 3, status: "open", playerToken: null, isHost: false },
    ]);
    const updateSeatCountWriter = vi.fn().mockResolvedValue({
      id: "game-1",
      status: "waiting",
      currentState: {},
      stateSchemaVersion: 1,
      handNumber: 0,
      version: 1,
    });

    const game = await updateSeatCount(
      {
        getGame,
        getSeatAssignments,
        updateSeatCount: updateSeatCountWriter,
        updateSeatAssignment: vi.fn(),
      },
      "game-1",
      0,
      6,
      "host-token",
    );

    expect(updateSeatCountWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "game-1",
        expectedVersion: 0,
        seatCount: 6,
      }),
    );
    expect(
      (
        updateSeatCountWriter.mock.calls[0][0] as {
          currentState: { config: { seatCount: number } };
        }
      ).currentState.config.seatCount,
    ).toBe(6);
    expect(game.poker.seatCount).toBe(6);
    expect(
      game.poker.players.find((player) => player.seat === 0),
    ).toMatchObject({
      playerToken: "host-token",
      isHost: true,
      status: "claimed",
    });
  });

  it("rejects a non-host caller", async () => {
    const getGame = vi.fn().mockResolvedValue(waitingGame(4));
    const getSeatAssignments = vi.fn().mockResolvedValue([
      { seat: 0, status: "claimed", playerToken: "host-token", isHost: true },
      { seat: 1, status: "open", playerToken: null, isHost: false },
    ]);

    await expect(
      updateSeatCount(
        {
          getGame,
          getSeatAssignments,
          updateSeatCount: vi.fn(),
          updateSeatAssignment: vi.fn(),
        },
        "game-1",
        0,
        6,
        "other-token",
      ),
    ).rejects.toThrow("Only the host can change the seat count");
  });

  it("rejects shrinking below an occupied seat", async () => {
    const getGame = vi.fn().mockResolvedValue(waitingGame(4));
    const getSeatAssignments = vi.fn().mockResolvedValue([
      { seat: 0, status: "claimed", playerToken: "host-token", isHost: true },
      { seat: 3, status: "bot", playerToken: null, isHost: false },
    ]);

    await expect(
      updateSeatCount(
        {
          getGame,
          getSeatAssignments,
          updateSeatCount: vi.fn(),
          updateSeatAssignment: vi.fn(),
        },
        "game-1",
        0,
        2,
        "host-token",
      ),
    ).rejects.toThrow("Cannot shrink seat count below an occupied seat");
  });

  it("rejects changes once the hand has started", async () => {
    const startedGame = waitingGame(4);
    const getGame = vi
      .fn()
      .mockResolvedValue({ ...startedGame, status: "playing" as const });

    await expect(
      updateSeatCount(
        {
          getGame,
          getSeatAssignments: vi.fn(),
          updateSeatCount: vi.fn(),
          updateSeatAssignment: vi.fn(),
        },
        "game-1",
        0,
        6,
        "host-token",
      ),
    ).rejects.toThrow("The game is not waiting");
  });
});

describe("updateTableSettings", () => {
  const waitingGame = {
    id: "game-1",
    status: "waiting" as const,
    currentState: pokerEngineAdapter.createGame({
      smallBlind: 50,
      bigBlind: 100,
      startingStack: 10_000,
      seatCount: 2,
      players: [
        {
          id: "human",
          name: "You",
          controller: "human" as const,
          seat: 0,
          stack: 10_000,
          status: "claimed" as const,
          playerToken: "host-token",
          isHost: true,
        },
      ],
    }),
    stateSchemaVersion: 1,
    handNumber: 0,
    version: 3,
  };

  it("updates blinds and every configured starting stack", async () => {
    const updateTableSettingsWriter = vi.fn().mockResolvedValue({
      ...waitingGame,
      currentState: {},
      version: 4,
    });

    const game = await updateTableSettings(
      {
        getGame: vi.fn().mockResolvedValue(waitingGame),
        getSeatAssignments: vi.fn().mockResolvedValue([
          {
            seat: 0,
            status: "claimed",
            playerToken: "host-token",
            isHost: true,
          },
          { seat: 1, status: "open", playerToken: null, isHost: false },
        ]),
        updateSeatAssignment: vi.fn(),
        updateTableSettings: updateTableSettingsWriter,
      },
      "game-1",
      3,
      {
        seatCount: 3,
        smallBlind: 25,
        bigBlind: 50,
        startingStack: 5_000,
      },
      "host-token",
    );

    const input = updateTableSettingsWriter.mock.calls[0][0] as {
      currentState: {
        config: {
          smallBlind: number;
          bigBlind: number;
          players: { stack: number }[];
        };
      };
    };
    expect(input.currentState.config).toMatchObject({
      smallBlind: 25,
      bigBlind: 50,
    });
    expect(input.currentState.config.players).toEqual([
      expect.objectContaining({ stack: 5_000 }),
    ]);
    expect(game.poker).toMatchObject({
      seatCount: 3,
      smallBlind: 25,
      bigBlind: 50,
      startingStack: 5_000,
    });
  });

  it("validates blind and stack relationships", () => {
    expect(() =>
      validateTableSettings({
        seatCount: 2,
        smallBlind: 100,
        bigBlind: 100,
        startingStack: 10_000,
      }),
    ).toThrow("bigBlind must be an integer greater than smallBlind");
    expect(() =>
      validateTableSettings({
        seatCount: 2,
        smallBlind: 50,
        bigBlind: 100,
        startingStack: 99,
      }),
    ).toThrow("startingStack must be an integer at least as large as bigBlind");
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
  it.each(["host-token", "spectator-token", null])(
    "applies an AI action with a private response for viewer %s",
    async (viewerToken) => {
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
              playerToken: "host-token",
              isHost: true,
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
          getHandHistory: vi.fn().mockResolvedValue({
            status: "playing",
            actions: [
              {
                sequence: 1,
                street: "preflop",
                action: "call",
                amount: 50,
                player: "You",
                controller: "human",
              },
            ],
            aiDecisions: [],
          }),
          persistAIAction,
        },
        {
          evaluate: async (request) => {
            const choices = Object.keys(request.questions.move.criteria);
            return {
              answers: {
                move: {
                  type: "choice",
                  choice: "check",
                  probabilities: Object.fromEntries(
                    choices.map((choice) => [
                      choice,
                      choice === "check" ? 1 : 0,
                    ]),
                  ),
                  confidence: 1,
                },
              },
            };
          },
        },
        "game-1",
        viewerToken,
      );

      expect(game.game.version).toBe(2);
      const human = game.game.poker.players.find(
        (player) => player.id === "human",
      );
      expect(human?.playerToken).toBe(
        viewerToken === "host-token" ? "host-token" : null,
      );
      expect(human?.isHost).toBe(true);
      if (viewerToken === "host-token") {
        expect(human?.holeCards).toHaveLength(2);
      } else {
        expect(human?.holeCards).toBeNull();
        expect(game.game.poker.legalActions).toEqual([]);
      }
      expect(
        game.game.poker.players.find((player) => player.id === "typesafe-ai"),
      ).toMatchObject({
        playerToken: null,
        holeCards: null,
      });
      expect(game.game.poker.currentActorId).toBe("typesafe-ai");
      expect(game.aiDecision.action).toBe("check");
      expect(persistAIAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "check",
          choice: "check",
          aiState: expect.objectContaining({
            hero: expect.objectContaining({
              seat: 1,
              controller: "bot",
              handStrength: expect.any(Object),
            }),
            actionHistory: [
              expect.objectContaining({
                action: "call",
                actorSeat: 0,
                actor: "opponent",
              }),
            ],
          }),
          promptVersion: "typesafe-poker-v2",
          rawResponse: expect.objectContaining({
            policyVersion: "typesafe-poker-v2",
            decision: expect.objectContaining({
              selectedCandidate: "check",
              candidateProbabilities: expect.any(Object),
            }),
          }),
        }),
      );
    },
  );

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
    ).rejects.toThrow("not a bot turn");
  });
});

describe("startNextHand", () => {
  it("resets a departing player's seat name when the next hand starts", async () => {
    let completedState = pokerEngineAdapter.startHand(
      pokerEngineAdapter.createGame({
        smallBlind: 50,
        bigBlind: 100,
        players: [
          {
            id: "departing-player",
            name: "Joni",
            controller: "human",
            seat: 0,
            stack: 10_000,
          },
          {
            id: "player-2",
            name: "Player 2",
            controller: "human",
            seat: 1,
            stack: 10_000,
          },
          {
            id: "player-3",
            name: "Player 3",
            controller: "human",
            seat: 2,
            stack: 10_000,
          },
        ],
      }),
      createDeterministicDeck(),
    );
    for (let folds = 0; folds < 2; folds += 1) {
      const actorId =
        pokerEngineAdapter.snapshot(completedState).currentActorId;
      if (!actorId) throw new Error("Expected a current actor");
      completedState = pokerEngineAdapter.applyAction(completedState, actorId, {
        type: "fold",
      });
    }
    const updateSeatAssignment = vi.fn().mockResolvedValue(undefined);

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
        getSeatAssignments: vi
          .fn()
          .mockResolvedValueOnce([
            {
              seat: 0,
              name: "Joni",
              status: "claimed",
              controller: "human",
              playerToken: "player-token",
              isHost: false,
              leaving: true,
              enginePlayerId: "departing-player",
            },
            {
              seat: 1,
              name: "Player 2",
              status: "claimed",
              controller: "human",
              playerToken: "player-2-token",
              isHost: true,
              leaving: false,
              enginePlayerId: "player-2",
            },
            {
              seat: 2,
              name: "Player 3",
              status: "claimed",
              controller: "human",
              playerToken: "player-3-token",
              isHost: false,
              leaving: false,
              enginePlayerId: "player-3",
            },
          ])
          .mockResolvedValueOnce([
            {
              seat: 0,
              name: "Seat 1",
              status: "open",
              controller: "human",
              playerToken: null,
              isHost: false,
              leaving: false,
              enginePlayerId: "departing-player",
            },
            {
              seat: 1,
              name: "Player 2",
              status: "claimed",
              controller: "human",
              playerToken: "player-2-token",
              isHost: true,
              leaving: false,
              enginePlayerId: "player-2",
            },
            {
              seat: 2,
              name: "Player 3",
              status: "claimed",
              controller: "human",
              playerToken: "player-3-token",
              isHost: false,
              leaving: false,
              enginePlayerId: "player-3",
            },
          ]),
        updateSeatAssignment,
        startNextHand: vi.fn().mockResolvedValue({
          id: "game-1",
          status: "playing",
          currentState: {},
          stateSchemaVersion: 1,
          handNumber: 2,
          version: 2,
        }),
      },
      "game-1",
      1,
      "player-2-token",
    );

    expect(updateSeatAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        seat: 0,
        name: "Seat 1",
        status: "open",
        playerToken: null,
        leaving: false,
      }),
    );
    expect(
      game.poker.players.find((player) => player.seat === 0),
    ).toMatchObject({ name: "Seat 1", status: "open", leaving: false });
  });

  it.each(["host-token", "spectator-token", null])(
    "starts the next hand with a private response for viewer %s",
    async (viewerToken) => {
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
                playerToken: "host-token",
                isHost: true,
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
        viewerToken,
      );

      expect(game).toMatchObject({ version: 2, status: "playing" });
      const human = game.poker.players.find((player) => player.id === "human");
      expect(human?.playerToken).toBe(
        viewerToken === "host-token" ? "host-token" : null,
      );
      expect(human?.isHost).toBe(true);
      if (viewerToken === "host-token") {
        expect(human?.holeCards).toHaveLength(2);
      } else {
        expect(human?.holeCards).toBeNull();
        expect(game.poker.legalActions).toEqual([]);
      }
      expect(
        game.poker.players.find((player) => player.id === "typesafe-ai"),
      ).toMatchObject({
        playerToken: null,
        holeCards: null,
      });
      expect(game.poker).toMatchObject({
        handNumber: 2,
        street: "preflop",
        communityCards: [],
      });
      expect(startNextHandWriter).toHaveBeenCalledWith(
        expect.objectContaining({ handNumber: 2, expectedVersion: 1 }),
      );
    },
  );
});

describe("startGame", () => {
  it("starts after the host moves from the originally configured seat", async () => {
    const state = pokerEngineAdapter.createGame({
      smallBlind: 50,
      bigBlind: 100,
      seatCount: 3,
      players: [
        {
          id: "human",
          name: "Host",
          controller: "human",
          seat: 0,
          stack: 10_000,
          status: "claimed",
          playerToken: "host-token",
          isHost: true,
        },
      ],
    });
    const storedGame = {
      id: "game-1",
      status: "waiting",
      currentState: state,
      stateSchemaVersion: 1,
      handNumber: 0,
      version: 0,
    };
    const startGameWriter = vi.fn().mockResolvedValue({
      ...storedGame,
      status: "playing",
      version: 1,
    });

    const game = await startGame(
      {
        getGame: vi.fn().mockResolvedValue(storedGame),
        getHostToken: vi.fn().mockResolvedValue("host-token"),
        getSeatAssignments: vi.fn().mockResolvedValue([
          {
            gameId: "game-1",
            seat: 0,
            name: "Seat 1",
            status: "open",
            controller: "human",
            playerToken: null,
            isHost: false,
            enginePlayerId: null,
          },
          {
            gameId: "game-1",
            seat: 1,
            name: "Host",
            status: "claimed",
            controller: "human",
            playerToken: "host-token",
            isHost: true,
            enginePlayerId: "human",
          },
          {
            gameId: "game-1",
            seat: 2,
            name: "TypeSafe Jev #1",
            status: "bot",
            controller: "bot",
            bot: {
              id: "jev",
              label: "TypeSafe Jev",
              provider: "typesafe",
              modelId: "jev-latest",
            },
            aiDifficulty: "medium",
            playerToken: null,
            isHost: false,
            enginePlayerId: "bot-game-1-2",
          },
        ]),
        updateSeatAssignment: vi.fn(),
        startGame: startGameWriter,
      },
      "game-1",
      0,
      "host-token",
    );

    expect(startGameWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        currentState: expect.objectContaining({
          config: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({ id: "human", seat: 1 }),
              expect.objectContaining({ id: "bot-game-1-2", seat: 2 }),
            ]),
          }),
        }),
      }),
    );
    expect(game.poker.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "human", seat: 1 }),
        expect.objectContaining({ id: "bot-game-1-2", seat: 2 }),
      ]),
    );
    expect(game.poker.currentActorId).not.toBeNull();
  });

  it("preserves the host's identity and actions without exposing another player's cards or token", async () => {
    const state = pokerEngineAdapter.createGame({
      smallBlind: 50,
      bigBlind: 100,
      players: [
        {
          id: "host",
          name: "Host",
          controller: "human",
          seat: 0,
          stack: 10_000,
          playerToken: "host-token",
          isHost: true,
        },
        {
          id: "guest",
          name: "Guest",
          controller: "human",
          seat: 1,
          stack: 10_000,
          playerToken: "guest-token",
        },
      ],
    });
    const storedGame = {
      id: "game-1",
      status: "waiting",
      currentState: state,
      stateSchemaVersion: 1,
      handNumber: 0,
      version: 0,
    };
    const game = await startGame(
      {
        getGame: vi.fn().mockResolvedValue(storedGame),
        getSeatAssignments: vi.fn().mockResolvedValue(
          state.config.players.map((player) => ({
            gameId: "game-1",
            seat: player.seat,
            status: "claimed",
            controller: player.controller,
            playerToken: player.playerToken,
            isHost: player.isHost ?? false,
            enginePlayerId: player.id,
          })),
        ),
        updateSeatAssignment: vi.fn(),
        startGame: vi
          .fn()
          .mockResolvedValue({ ...storedGame, status: "playing", version: 1 }),
      },
      "game-1",
      0,
      "host-token",
    );

    expect(
      game.poker.players.find((player) => player.id === "host"),
    ).toMatchObject({
      playerToken: "host-token",
      isHost: true,
      holeCards: expect.arrayContaining([expect.any(String)]),
    });
    expect(game.poker.currentActorId).toBe("host");
    expect(game.poker.legalActions.length).toBeGreaterThan(0);
    expect(
      game.poker.players.find((player) => player.id === "guest"),
    ).toMatchObject({
      playerToken: null,
      holeCards: null,
    });
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
        const moveQuestion = request.questions.move;
        if (!moveQuestion) {
          throw new Error("Expected a TypeSafe move question");
        }
        const options = Object.keys(moveQuestion.criteria);
        const choice = options.includes("check") ? "check" : "call";
        return {
          answers: {
            move: {
              type: "choice",
              choice,
              probabilities: Object.fromEntries(
                options.map((option) => [option, option === choice ? 1 : 0]),
              ),
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

describe("getGameFeed", () => {
  it("builds hand-started, action, and win events from persisted feed rows", async () => {
    const initialState = pokerEngineAdapter.startHand(
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
            id: "ai",
            name: "TypeSafe AI",
            controller: "typesafe_ai",
            seat: 1,
            stack: 10_000,
          },
        ],
      }),
      createDeterministicDeck(),
    );
    let state = initialState;
    state = pokerEngineAdapter.applyAction(state, "human", { type: "fold" });

    const repository = {
      getGameFeed: async () => ({
        hands: [
          {
            handNumber: 1,
            status: "complete" as const,
            initialState,
            finalState: state,
            actions: [
              {
                sequence: 1,
                street: "preflop" as const,
                action: "fold" as const,
                amount: null,
                player: "You",
                controller: "human" as const,
              },
            ],
          },
        ],
      }),
    };

    const feed = await getGameFeed(repository, "game-1");

    expect(feed.events).toEqual([
      { type: "handStarted", handNumber: 1 },
      {
        type: "blind",
        handNumber: 1,
        player: "You",
        controller: "human",
        blind: "small",
        amount: 50,
      },
      {
        type: "blind",
        handNumber: 1,
        player: "TypeSafe AI",
        controller: "bot",
        blind: "big",
        amount: 100,
      },
      {
        type: "action",
        handNumber: 1,
        player: "You",
        controller: "human",
        action: "fold",
        amount: null,
        street: "preflop",
      },
      {
        type: "win",
        handNumber: 1,
        player: "TypeSafe AI",
        amount: expect.any(Number),
        uncontested: true,
      },
    ]);
  });

  it("adds blinds to an active hand without a final state", async () => {
    const initialState = pokerEngineAdapter.startHand(
      pokerEngineAdapter.createGame({
        smallBlind: 25,
        bigBlind: 50,
        players: [
          {
            id: "human",
            name: "You",
            controller: "human",
            seat: 0,
            stack: 1_000,
          },
          {
            id: "bot",
            name: "Bot",
            controller: "bot",
            seat: 1,
            stack: 1_000,
          },
        ],
      }),
      createDeterministicDeck(),
    );
    const repository = {
      getGameFeed: async () => ({
        hands: [
          {
            handNumber: 2,
            status: "playing" as const,
            initialState,
            finalState: null,
            actions: [],
          },
        ],
      }),
    };

    await expect(getGameFeed(repository, "game-1")).resolves.toEqual({
      events: [
        { type: "handStarted", handNumber: 2 },
        expect.objectContaining({
          type: "blind",
          blind: "small",
          amount: 25,
        }),
        expect.objectContaining({
          type: "blind",
          blind: "big",
          amount: 50,
        }),
      ],
    });
  });

  it("keeps actions when blind synthesis cannot restore the initial state", async () => {
    const repository = {
      getGameFeed: async () => ({
        hands: [
          {
            handNumber: 3,
            status: "playing" as const,
            initialState: { stateSchemaVersion: 99 },
            finalState: null,
            actions: [
              {
                sequence: 1,
                street: "preflop" as const,
                action: "check" as const,
                amount: null,
                player: "You",
                controller: "human" as const,
              },
            ],
          },
        ],
      }),
    };

    await expect(getGameFeed(repository, "game-1")).resolves.toEqual({
      events: [
        { type: "handStarted", handNumber: 3 },
        expect.objectContaining({ type: "action", action: "check" }),
      ],
    });
  });
});
