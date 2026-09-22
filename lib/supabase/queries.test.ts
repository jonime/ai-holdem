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
} {
  const rpc = vi.fn().mockResolvedValue({
    data: options.updateResult ?? [persistedGame],
    error: null,
  });

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
        update: () => ({
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
        }),
      }),
      rpc,
    },
    rpc,
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
          controller: "typesafe_ai",
          stack: 10_000,
        },
      ],
    });
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
