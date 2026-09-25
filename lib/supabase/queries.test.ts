import { describe, expect, it, vi } from "vitest";

import {
  GameConflictError,
  type GameDatabaseClient,
  SupabaseGameRepository,
} from "./queries";

const persistedGame = {
  id: "game-1",
  status: "playing",
  current_state: { stateSchemaVersion: 1 },
  state_schema_version: 1,
  hand_number: 1,
  version: 4,
};

function createClient(options: {
  readonly createResult?: unknown;
  readonly loadResult?: unknown;
  readonly updateResult?: unknown;
}): {
  readonly client: GameDatabaseClient;
  readonly rpc: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
} {
  const rpc = vi.fn().mockResolvedValue({
    data: options.updateResult ?? [persistedGame],
    error: null,
  });
  const update = vi.fn();

  return {
    client: {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: options.createResult ?? persistedGame,
              error: null,
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            then: (resolve, reject) =>
              Promise.resolve({
                data: options.loadResult ?? [persistedGame],
                error: null,
              }).then(resolve, reject),
            maybeSingle: async () => ({
              data: options.loadResult ?? persistedGame,
              error: null,
            }),
          }),
        }),
        update: (values) => {
          update(values);
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: options.updateResult ?? persistedGame,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      }),
      rpc,
    },
    rpc,
    update,
  };
}

describe("SupabaseGameRepository", () => {
  it("creates and reloads a game", async () => {
    const { client } = createClient({});
    const repository = new SupabaseGameRepository(client);

    const created = await repository.createGame({
      currentState: { stateSchemaVersion: 1 },
      stateSchemaVersion: 1,
      handNumber: 1,
      status: "playing",
    });
    const loaded = await repository.getGame("game-1");

    expect(created).toMatchObject({ id: "game-1", version: 4 });
    expect(loaded).toEqual(created);
  });

  it("creates a game session with its player seats", async () => {
    const { client, rpc } = createClient({ updateResult: [persistedGame] });
    const repository = new SupabaseGameRepository(client);

    const created = await repository.createGameSession({
      hostToken: "host-token",
      currentState: { stateSchemaVersion: 1 },
      stateSchemaVersion: 1,
      handNumber: 1,
      status: "playing",
      players: [
        {
          enginePlayerId: "human",
          seat: 0,
          name: "You",
          controller: "human",
          stack: 10_000,
        },
        {
          enginePlayerId: "ai",
          seat: 1,
          name: "TypeSafe AI",
          controller: "typesafe_ai",
          aiDifficulty: "hard",
          stack: 10_000,
        },
      ],
    });

    expect(created.id).toBe("game-1");
    expect(rpc).toHaveBeenCalledWith("create_game_session", {
      p_current_state: { stateSchemaVersion: 1 },
      p_state_schema_version: 1,
      p_hand_number: 1,
      p_status: "playing",
      p_host_token: "host-token",
      p_players: [
        {
          engine_player_id: "human",
          seat: 0,
          name: "You",
          controller: "human",
          stack: 10_000,
        },
        {
          engine_player_id: "ai",
          seat: 1,
          name: "TypeSafe AI",
          controller: "bot",
          bot_id: "jev",
          bot_label: "TypeSafe Jev",
          bot_provider: "typesafe",
          bot_model_id: "jev-latest",
          ai_difficulty: "hard",
          stack: 10_000,
        },
      ],
    });
  });

  it("persists the controller when updating a bot seat", async () => {
    const { client, update } = createClient({});
    const repository = new SupabaseGameRepository(client);

    await repository.updateSeatAssignment({
      gameId: "game-1",
      seat: 1,
      status: "bot",
      controller: "bot",
      aiDifficulty: "easy",
      enginePlayerId: "bot-game-1-1",
    });

    expect(update).toHaveBeenCalledWith({
      status: "bot",
      controller: "bot",
      ai_difficulty: "easy",
      engine_player_id: "bot-game-1-1",
    });
  });

  it("loads and validates a bot difficulty from seat assignments", async () => {
    const { client } = createClient({
      loadResult: [
        {
          seat: 1,
          name: "TypeSafe AI",
          status: "bot",
          controller: "typesafe_ai",
          ai_difficulty: "hard",
          player_token: null,
          is_host: false,
          leaving: false,
          engine_player_id: "ai",
        },
      ],
    });
    const repository = new SupabaseGameRepository(client);

    await expect(repository.getSeatAssignments("game-1")).resolves.toEqual([
      expect.objectContaining({ aiDifficulty: "hard" }),
    ]);
  });

  it("withholds AI inspection data for an active hand", async () => {
    const activeHistory = {
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
      aiDecisions: [
        {
          actionSequence: 2,
          state: { private: true },
          legalActions: [],
          choice: "check",
          probabilities: {},
          confidence: 1,
          raiseSizeChoice: null,
          raiseSizeProbabilities: null,
          rawResponse: { private: true },
        },
      ],
    };
    const { client } = createClient({ updateResult: activeHistory });
    const repository = new SupabaseGameRepository(client);

    const history = await repository.getHandHistory("game-1", 1);

    expect(history).toMatchObject({
      status: "playing",
      actions: [expect.objectContaining({ action: "call" })],
    });
    expect(history?.aiDecisions).toEqual([]);
  });

  it("loads the initial hand state used by the game feed", async () => {
    const initialState = { stateSchemaVersion: 1, engineState: {} };
    const { client } = createClient({
      updateResult: [
        {
          handNumber: 1,
          status: "playing",
          initialState,
          finalState: null,
          actions: [],
        },
      ],
    });
    const repository = new SupabaseGameRepository(client);

    await expect(repository.getGameFeed("game-1")).resolves.toEqual({
      hands: [
        expect.objectContaining({ handNumber: 1, initialState, actions: [] }),
      ],
    });
  });

  it("rejects a non-object initial state in the game feed", async () => {
    const { client } = createClient({
      updateResult: [
        {
          handNumber: 1,
          status: "playing",
          initialState: "invalid",
          finalState: null,
          actions: [],
        },
      ],
    });
    const repository = new SupabaseGameRepository(client);

    await expect(repository.getGameFeed("game-1")).rejects.toThrow(
      "invalid game feed initial state",
    );
  });

  it("keeps legacy game feed rows that predate initial-state projection", async () => {
    const { client } = createClient({
      updateResult: [
        {
          handNumber: 1,
          status: "playing",
          finalState: null,
          actions: [],
        },
      ],
    });
    const repository = new SupabaseGameRepository(client);

    await expect(repository.getGameFeed("game-1")).resolves.toEqual({
      hands: [expect.objectContaining({ initialState: null })],
    });
  });

  it("updates a game once through the version-checked RPC", async () => {
    const updatedGame = { ...persistedGame, version: 5 };
    const { client, rpc } = createClient({ updateResult: [updatedGame] });
    const repository = new SupabaseGameRepository(client);

    const updated = await repository.compareAndSwapGame({
      gameId: "game-1",
      expectedVersion: 4,
      currentState: { stateSchemaVersion: 1, changed: true },
      stateSchemaVersion: 1,
      handNumber: 1,
      status: "playing",
    });

    expect(updated.version).toBe(5);
    expect(rpc).toHaveBeenCalledWith("update_game_state_if_version", {
      p_game_id: "game-1",
      p_expected_version: 4,
      p_current_state: { stateSchemaVersion: 1, changed: true },
      p_status: "playing",
      p_hand_number: 1,
      p_state_schema_version: 1,
    });
  });

  it("starts a next hand through the version-checked RPC", async () => {
    const { client, rpc } = createClient({
      updateResult: [{ ...persistedGame, version: 5, hand_number: 2 }],
    });
    const repository = new SupabaseGameRepository(client);

    await repository.startNextHand({
      gameId: "game-1",
      expectedVersion: 4,
      currentState: { nextHand: true },
      stateSchemaVersion: 1,
      handNumber: 2,
    });

    expect(rpc).toHaveBeenCalledWith("start_next_hand_if_version", {
      p_game_id: "game-1",
      p_expected_version: 4,
      p_current_state: { nextHand: true },
      p_hand_number: 2,
      p_state_schema_version: 1,
    });
  });

  it("updates waiting table settings through one RPC", async () => {
    const { client, rpc } = createClient({
      updateResult: [{ ...persistedGame, status: "waiting", version: 5 }],
    });
    const repository = new SupabaseGameRepository(client);

    await repository.updateTableSettings({
      gameId: "game-1",
      expectedVersion: 4,
      seatCount: 4,
      smallBlind: 25,
      bigBlind: 50,
      startingStack: 5_000,
      currentState: { configured: true },
      stateSchemaVersion: 1,
    });

    expect(rpc).toHaveBeenCalledWith("update_table_settings_if_version", {
      p_game_id: "game-1",
      p_expected_version: 4,
      p_seat_count: 4,
      p_small_blind: 25,
      p_big_blind: 50,
      p_starting_stack: 5_000,
      p_current_state: { configured: true },
      p_state_schema_version: 1,
    });
  });

  it("persists a human action and state transition through one RPC", async () => {
    const updatedGame = { ...persistedGame, version: 5 };
    const { client, rpc } = createClient({ updateResult: [updatedGame] });
    const repository = new SupabaseGameRepository(client);

    await repository.persistHumanAction({
      gameId: "game-1",
      expectedVersion: 4,
      playerEngineId: "human",
      currentState: { after: true },
      stateSchemaVersion: 1,
      handNumber: 1,
      status: "playing",
      street: "preflop",
      action: "call",
      amount: 50,
      stateBefore: { before: true },
      handComplete: false,
    });

    expect(rpc).toHaveBeenCalledWith("apply_human_action_if_version", {
      p_game_id: "game-1",
      p_expected_version: 4,
      p_player_engine_id: "human",
      p_current_state: { after: true },
      p_status: "playing",
      p_hand_number: 1,
      p_state_schema_version: 1,
      p_street: "preflop",
      p_action: "call",
      p_amount: 50,
      p_state_before: { before: true },
      p_state_after: { after: true },
      p_hand_complete: false,
      p_auto_reveal_player_engine_id: null,
      p_auto_reveal_reason: null,
    });
  });

  it("persists an AI action and auditable decision through one RPC", async () => {
    const { client, rpc } = createClient({
      updateResult: [{ ...persistedGame, version: 5 }],
    });
    const repository = new SupabaseGameRepository(client);

    await repository.persistAIAction({
      gameId: "game-1",
      expectedVersion: 4,
      playerEngineId: "typesafe-ai",
      currentState: { after: true },
      stateSchemaVersion: 1,
      handNumber: 1,
      status: "playing",
      street: "preflop",
      action: "check",
      amount: null,
      stateBefore: { before: true },
      handComplete: false,
      aiState: { hero: { holeCards: ["As", "Kd"] } },
      legalActions: [{ type: "check" }],
      choice: "check",
      probabilities: { check: 1 },
      confidence: 1,
      raiseSizeChoice: null,
      raiseSizeProbabilities: null,
      rawResponse: { answers: {} },
    });

    expect(rpc).toHaveBeenCalledWith(
      "apply_ai_action_if_version",
      expect.objectContaining({
        p_player_engine_id: "typesafe-ai",
        p_choice: "check",
        p_confidence: 1,
        p_ai_state: { hero: { holeCards: ["As", "Kd"] } },
      }),
    );
  });

  it("rejects a stale version when the RPC updates no row", async () => {
    const { client } = createClient({ updateResult: [] });
    const repository = new SupabaseGameRepository(client);

    await expect(
      repository.compareAndSwapGame({
        gameId: "game-1",
        expectedVersion: 3,
        currentState: {},
        stateSchemaVersion: 1,
        handNumber: 1,
        status: "playing",
      }),
    ).rejects.toBeInstanceOf(GameConflictError);
  });
});
