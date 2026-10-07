import { BotStepClaimLostError } from "@/lib/poker/bot-step-claims";
import { describe, expect, it, vi } from "vitest";

import {
  GameConflictError,
  type GameDatabaseClient,
  type FilteredQueryResult,
  type PersistAIActionInput,
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

  const query: FilteredQueryResult = {
    eq: () => query,
    then: (resolve, reject) => Promise.resolve({ data: options.loadResult ?? [persistedGame], error: null }).then(resolve, reject),
    maybeSingle: async () => ({ data: options.loadResult ?? persistedGame, error: null }),
  };

  return {
    client: {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: options.createResult ?? persistedGame, error: null }),
          }),
        }),
        select: () => ({ eq: () => query }),
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
  it.each([false, true])("uses one atomic action RPC with leaveSeat=%s", async leaveSeat => {
    const { client, rpc, update } = createClient({ updateResult: [persistedGame] });
    const input = {
      gameId: "game-1", expectedVersion: 3, playerEngineId: "bot",
      currentState: {}, stateSchemaVersion: 1, handNumber: 1, status: "complete",
      street: "preflop", action: "fold", amount: null, stateBefore: {}, handComplete: true,
      choice: "fold",
      bot: { id: "llm", label: "LLM", provider: "llm", modelId: "mock" },
      matchedRule: "llm_credit_limit_exit", leaveSeat,
    } satisfies PersistAIActionInput;
    const repository = new SupabaseGameRepository(client);
    await repository.persistAIAction(input);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      leaveSeat ? "apply_ai_action_and_leave_if_version" : "apply_ai_action_if_version",
      expect.objectContaining({ p_expected_version: 3, p_action: "fold", p_player_engine_id: "bot" }),
    );
    rpc.mockClear();
    const claimed = { ...input, claimToken: "d06c1650-b45f-4ead-8ab9-65de9d402b17" };
    await expect(repository.persistClaimedAIAction({ ...claimed, claimToken: "" })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    await repository.persistClaimedAIAction(claimed);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      leaveSeat ? "commit_bot_departure_with_claim" : "commit_bot_action_with_claim",
      expect.objectContaining({ p_claim_token: "d06c1650-b45f-4ead-8ab9-65de9d402b17", p_expected_version: 3, p_action: "fold" }),
    );
    rpc.mockResolvedValueOnce({ data: null, error: { message: "BOT_STEP_CLAIM_LOST" } });
    await expect(repository.persistClaimedAIAction(claimed)).rejects.toBeInstanceOf(BotStepClaimLostError);
    expect(update).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(repository.persistAIAction(input)).rejects.toBeInstanceOf(GameConflictError);
  });
  it("loads only validated game IDs for visitor-specific directory exclusions", async () => {
    const { client, rpc } = createClient({
      updateResult: [{ game_id: "game-1" }, { game_id: "game-2" }],
    });
    const repository = new SupabaseGameRepository(client);

    await expect(repository.listPublicGameExclusions("player-token")).resolves.toEqual([
      "game-1",
      "game-2",
    ]);
    expect(rpc).toHaveBeenCalledWith("list_public_game_exclusions", {
      p_player_token: "player-token",
    });
  });

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

  it.each([undefined, 0, 12])("selects the feed RPC for cursor %s", async sinceHand => {
    const { client, rpc } = createClient({ updateResult: [] });
    await expect(new SupabaseGameRepository(client).getGameFeed("game-1", undefined, sinceHand))
      .resolves.toEqual({ hands: [] });
    expect(rpc).toHaveBeenCalledWith(sinceHand === undefined ? "get_game_feed" : "get_game_feed_since", {
      p_game_id: "game-1",
      p_hand_limit: 50,
      ...(sinceHand === undefined ? {} : { p_since_hand: sinceHand }),
    });
  });

  it("loads the initial hand state used by the game feed", async () => {
    const initialState = { stateSchemaVersion: 1, engineState: {} };
    const { client } = createClient({
      updateResult: [
        {
          handNumber: 1,
          status: "playing",
          initialState,
          latestState: initialState,
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

  it("loads the latest state for server-side feed projection", async () => {
    const initialState = { stateSchemaVersion: 1, engineState: { step: 1 } };
    const latestState = { stateSchemaVersion: 1, engineState: { step: 2 } };
    const { client } = createClient({
      updateResult: [
        {
          handNumber: 1,
          status: "playing",
          initialState,
          latestState,
          actions: [
            {
              seat: 1,
              sequence: 1,
              street: "preflop",
              action: "call",
              amount: 50,
              player: "You",
              controller: "human",
            },
          ],
        },
      ],
    });
    const repository = new SupabaseGameRepository(client);

    await expect(repository.getGameFeed("game-1")).resolves.toEqual({
      hands: [
        expect.objectContaining({
          latestState,
          actions: [expect.objectContaining({ action: "call", seat: 1 })],
        }),
      ],
    });
  });

  it.each([-1, 6, 0.5, "1"])("rejects an invalid feed action seat %s", async (seat) => {
    const { client } = createClient({ updateResult: [{ handNumber: 1, status: "playing", actions: [{
      sequence: 1, street: "preflop", action: "check", amount: null,
      player: "Duplicate", controller: "human", seat,
    }] }] });
    await expect(new SupabaseGameRepository(client).getGameFeed("game-1")).rejects.toThrow("invalid game feed action seat");
  });

  it("keeps legacy action seats null without guessing by name", async () => {
    const { client } = createClient({ updateResult: [{ handNumber: 1, status: "playing", actions: [{
      sequence: 1, street: "preflop", action: "check", amount: null,
      player: "Duplicate", controller: "human",
    }] }] });
    const feed = await new SupabaseGameRepository(client).getGameFeed("game-1");
    expect(feed.hands[0].actions[0].seat).toBeNull();
  });

  it("rejects a malformed latest state in the game feed", async () => {
    const { client } = createClient({
      updateResult: [
        {
          handNumber: 1,
          status: "playing",
          initialState: { stateSchemaVersion: 1, engineState: {} },
          latestState: "invalid",
          actions: [],
        },
      ],
    });
    const repository = new SupabaseGameRepository(client);

    await expect(repository.getGameFeed("game-1")).rejects.toThrow(
      "invalid game feed latest state",
    );
  });

  it("rejects a non-object initial state in the game feed", async () => {
    const { client } = createClient({
      updateResult: [
        {
          handNumber: 1,
          status: "playing",
          initialState: "invalid",
          latestState: {},
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

  it("persists an AI action without debug inspection payloads through one RPC", async () => {
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
      choice: "check",
    });

    expect(rpc).toHaveBeenCalledWith(
      "apply_ai_action_if_version",
      expect.objectContaining({
        p_player_engine_id: "typesafe-ai",
        p_choice: "check",
        p_confidence: null,
        p_ai_state: null,
        p_raw_response: null,
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

const snapshotRow = {
  game: persistedGame,
  assignments: [{
    game_id: "game-1", seat: 0, name: "Legacy bot", status: "bot",
    controller: "typesafe_ai", player_token: null, engine_player_id: "bot",
    is_host: false, leaving: false,
  }],
  host_token: null,
  listing: null,
  revealed_player_ids: ["bot"],
};

describe("game read snapshots", () => {
  it("uses exactly one RPC, normalizes legacy bots, and accepts absent host/listing rows", async () => {
    const { client, rpc } = createClient({ updateResult: snapshotRow });
    const from = vi.spyOn(client, "from");
    const snapshot = await new SupabaseGameRepository(client).getGameReadSnapshot("game-1");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_game_read_snapshot", { p_game_id: "game-1" });
    expect(from).not.toHaveBeenCalled();
    expect(snapshot).toMatchObject({
      game: { id: "game-1", version: 4 }, hostToken: null, listing: null,
      revealedPlayerIds: ["bot"],
      assignments: [{ controller: "bot", bot: { id: "jev", provider: "typesafe" } }],
    });
  });

  it("parses host and publication fields", async () => {
    const { client } = createClient({ updateResult: {
      ...snapshotRow, host_token: "host", listing: {
        is_public: true, title: "Table", published_at: "2026-10-04T10:00:00Z",
        host_lease_expires_at: "2026-10-04T10:02:00Z",
      },
    } });
    expect(await new SupabaseGameRepository(client).getGameReadSnapshot("game-1"))
      .toMatchObject({ hostToken: "host", listing: { isPublic: true, title: "Table" } });
  });

  it("returns null for missing games without follow-up reads", async () => {
    const { client, rpc } = createClient({});
    rpc.mockResolvedValue({ data: null, error: null });
    const from = vi.spyOn(client, "from");
    expect(await new SupabaseGameRepository(client).getGameReadSnapshot("missing")).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("propagates RPC failures", async () => {
    const { client, rpc } = createClient({});
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(new SupabaseGameRepository(client).getGameReadSnapshot("game-1"))
      .rejects.toThrow("Unable to load game snapshot: offline");
  });

  it.each([
    [], {}, { ...snapshotRow, game: null },
    { ...snapshotRow, game: { ...persistedGame, id: "other" } },
    { ...snapshotRow, game: { ...persistedGame, version: -1 } },
    { ...snapshotRow, game: { ...persistedGame, current_state: null } },
    { ...snapshotRow, assignments: null },
    { ...snapshotRow, assignments: [null] },
    { ...snapshotRow, assignments: [{ ...snapshotRow.assignments[0], game_id: "other" }] },
    { ...snapshotRow, assignments: [{ ...snapshotRow.assignments[0], seat: 6 }] },
    { ...snapshotRow, assignments: [snapshotRow.assignments[0], snapshotRow.assignments[0]] },
    { ...snapshotRow, assignments: [{ ...snapshotRow.assignments[0], player_token: 1 }] },
    { ...snapshotRow, assignments: [{ ...snapshotRow.assignments[0], ai_difficulty: "invalid" }] },
    { ...snapshotRow, assignments: [{ ...snapshotRow.assignments[0], controller: "invalid" }] },
    { ...snapshotRow, host_token: undefined },
    { ...snapshotRow, listing: {} },
    { ...snapshotRow, revealed_player_ids: [1] },
    { ...snapshotRow, revealed_player_ids: null },
  ])("rejects malformed snapshot %#", async (data) => {
    const { client } = createClient({ updateResult: data });
    await expect(new SupabaseGameRepository(client).getGameReadSnapshot("game-1"))
      .rejects.toThrow(/invalid/);
  });

  it("selects only IDs and filters reveals by game and hand in SQL", async () => {
    const { client } = createClient({ loadResult: [{ engine_player_id: "human" }] });
    const eq = vi.fn();
    const query: FilteredQueryResult = {
      eq: (column, value) => { eq(column, value); return query; },
      then: (resolve, reject) => Promise.resolve({ data: [{ engine_player_id: "human" }], error: null }).then(resolve, reject),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const table = client.from("hand_card_reveals");
    const select = vi.fn().mockReturnValue({ eq: query.eq });
    vi.spyOn(client, "from").mockReturnValue({ ...table, select });
    expect(await new SupabaseGameRepository(client).getCurrentHandRevealedPlayerIds("game-1", 42))
      .toEqual(["human"]);
    expect(select).toHaveBeenCalledExactlyOnceWith("engine_player_id");
    expect(eq.mock.calls).toEqual([["game_id", "game-1"], ["hand_number", 42]]);
  });
});

describe("atomic seat RPC results", () => {
  const row = { game_id: "game-1", seat: 1, name: "Ada", status: "claimed", controller: "human", player_token: "owner", is_host: false, leaving: false, engine_player_id: "stable" };
  const input = { gameId: "game-1", seat: 1, playerToken: "owner", expectedVersion: 4, name: null };
  const bot = { id: "jev", label: "TypeSafe Jev", provider: "typesafe" as const, modelId: "jev-latest" };
  function setup(data: unknown) {
    const { client, rpc } = createClient({ updateResult: data });
    rpc.mockResolvedValue({ data, error: null });
    const from = vi.spyOn(client, "from");
    return { repository: new SupabaseGameRepository(client), rpc, from };
  }
  it.each(["claim", "assign", "release"])("parses the %s returned row with no follow-up query", async operation => {
    const { repository, rpc, from } = setup({ outcome: "ok", seat: row, version: 5 });
    const result = operation === "claim" ? await repository.claimSeatIfVersion(input) : operation === "release" ? await repository.releaseSeatIfVersion(input) : await repository.assignBotIfVersion({ gameId: "game-1", seat: 1, expectedVersion: 4, hostToken: "host", name: "Bot #1", bot, aiDifficulty: "medium", botProfileId: null });
    expect(result).toMatchObject({ gameId: "game-1", seat: 1, name: "Ada", enginePlayerId: "stable", playerToken: "owner" });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_game_id: "game-1", p_seat: 1, p_expected_version: 4 });
    expect(from).not.toHaveBeenCalled();
  });
  it("accepts stale idempotent success and legacy bot rows", async () => {
    const { repository, from } = setup({ outcome: "ok", version: 2, seat: { ...row, status: "bot", controller: "typesafe_ai" } });
    expect(await repository.claimSeatIfVersion(input)).toMatchObject({ controller: "bot", bot, botProfileId: null });
    expect(from).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { outcome: "unexpected" }, { outcome: "ok" },
    ...[undefined, -1, 1.5, "5", Number.MAX_SAFE_INTEGER + 1].map(version => ({ outcome: "ok", version, seat: row })),
    ...[null, {}, { ...row, game_id: "other" }, { ...row, seat: 2 }, { ...row, status: "bad" }, { ...row, controller: "bad" }, { ...row, name: null }].map(seat => ({ outcome: "ok", version: 5, seat })),
  ])("rejects malformed or mismatched results %#", async data => {
    const { repository, from } = setup(data);
    await expect(repository.claimSeatIfVersion(input)).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it.each([
    ["conflict", "GameConflictError"], ["missing", "Seat does not exist"], ["unavailable", "Seat is not open"], ["forbidden", "Seat does not belong to this player"],
  ])("preserves %s outcomes", async (outcome, message) => {
    const { repository, from } = setup({ outcome });
    const result = repository.releaseSeatIfVersion(input);
    if (outcome === "conflict") await expect(result).rejects.toBeInstanceOf(GameConflictError);
    else await expect(result).rejects.toThrow(message);
    expect(from).not.toHaveBeenCalled();
  });
  it("maps forbidden bot assignment to the host HTTP error", async () => {
    const { repository } = setup({ outcome: "forbidden" });
    await expect(repository.assignBotIfVersion({ gameId: "game-1", seat: 1, expectedVersion: 4, hostToken: "other", name: "Bot", bot, aiDifficulty: "medium", botProfileId: null })).rejects.toThrow("Only the host can assign bots");
  });
  it("propagates transport failures without querying seats", async () => {
    const { repository, rpc, from } = setup({});
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(repository.claimSeatIfVersion(input)).rejects.toThrow("Unable to update seat assignment: offline");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("private bot hand context read", () => {
  it("calls only the hand-filtered RPC and treats empty legacy state as unknown", async () => {
    const { client,rpc }=createClient({ updateResult:{ version:4,handNumber:2,initialState:{},actions:[] } });
    const result=await new SupabaseGameRepository(client).getBotHandContext("game-1",2);
    expect(result).toEqual({ version:4,handNumber:2,initialState:null,actions:[] });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_bot_hand_context",{ p_game_id:"game-1",p_hand_number:2 });
  });
  it("rejects cross-hand and malformed states, and keeps DB failures visible", async () => {
    const { client,rpc }=createClient({ updateResult:{ version:4,handNumber:3,initialState:{},actions:[] } });
    const repo=new SupabaseGameRepository(client);
    await expect(repo.getBotHandContext("game-1",2)).rejects.toThrow();
    rpc.mockResolvedValue({ data:{ version:4,handNumber:2,initialState:{ stateSchemaVersion:1 },actions:[] },error:null });
    await expect(repo.getBotHandContext("game-1",2)).rejects.toThrow();
    rpc.mockResolvedValue({ data:null,error:{ message:"database unavailable" } });
    await expect(repo.getBotHandContext("game-1",2)).rejects.toThrow("Unable to load bot hand context");
  });
});

it("parses claim outcomes defensively and releases only the supplied token", async () => {
  const { client, rpc } = createClient({ updateResult: { outcome: "acquired" } });
  const repository = new SupabaseGameRepository(client);
  const input = { gameId: "game", expectedVersion: 1, actorEngineId: "bot", claimToken: "secret" };
  await expect(repository.acquireBotStepClaim(input)).resolves.toEqual({ outcome: "acquired" });
  expect(rpc).toHaveBeenLastCalledWith("acquire_bot_step_claim", { p_game_id: "game", p_expected_version: 1, p_actor_engine_id: "bot", p_claim_token: "secret" });
  rpc.mockResolvedValueOnce({ data: { outcome: "busy", expiresAt: new Date().toISOString(), retryAfterMs: 90000 }, error: null });
  await expect(repository.acquireBotStepClaim(input)).resolves.toMatchObject({ outcome: "busy", retryAfterMs: 90000 });
  rpc.mockResolvedValueOnce({ data: { outcome: "busy", retryAfterMs: -1 }, error: null });
  await expect(repository.acquireBotStepClaim(input)).rejects.toThrow();
  rpc.mockResolvedValueOnce({ data: { outcome: "conflict" }, error: null });
  await expect(repository.acquireBotStepClaim(input)).rejects.toBeInstanceOf(GameConflictError);
  rpc.mockResolvedValueOnce({ data: null, error: { message: "private token secret" } });
  await expect(repository.acquireBotStepClaim(input)).rejects.toThrow("Unable to acquire bot step claim");
  await repository.releaseBotStepClaim("game", "secret");
  expect(rpc).toHaveBeenLastCalledWith("release_bot_step_claim", { p_game_id: "game", p_claim_token: "secret" });
});

it("external admission charges the persisted host, regardless of the seated driver", async () => {
  vi.stubEnv("USAGE_LIMIT_HASH_SECRET", "test-only-32-byte-secret-for-usage-tests");
  try {
    const { hashUsageIdentity } = await import("@/lib/usage/identity");
    const { client, rpc } = createClient({ loadResult: { host_token: "durable-host" }, updateResult: { outcome: "admitted" } });
    const repository = new SupabaseGameRepository(client);
    await repository.admitExternalBotCall({ gameId: "game", expectedVersion: 1, claimToken: "claim" });
    expect(rpc).toHaveBeenCalledWith("admit_external_bot_call", expect.objectContaining({ p_owner_hash: hashUsageIdentity("owner", "durable-host"), p_game_id: "game", p_claim_token: "claim" }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("durable-host");
    vi.spyOn(repository, "getHostToken").mockResolvedValueOnce(null);
    rpc.mockClear();
    await expect(repository.admitExternalBotCall({ gameId: "game", expectedVersion: 1, claimToken: "claim" })).rejects.toThrow("Usage admission temporarily unavailable");
    expect(rpc).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); }
});

it("parses only summary fields from the personal RPC", async () => {
  const { client, rpc } = createClient({ updateResult: [{ game_id: "11111111-1111-4111-8111-111111111111", title: null, status: "complete", updated_at: "2026-10-06T12:00:00+00:00", occupied_seats: 1, total_seats: 6, current_state: { cards: ["As"] } }] });
  const result = await new SupabaseGameRepository(client).listMyGames("owner");
  expect(rpc).toHaveBeenCalledWith("list_my_games", { p_player_token: "owner" });
  expect(result[0]).toEqual({ gameId: "11111111-1111-4111-8111-111111111111", title: null, status: "complete", updatedAt: "2026-10-06T12:00:00+00:00", occupiedSeats: 1, totalSeats: 6 });
});
it.each([null, {}, [null], [{ game_id: "invalid" }]])("rejects invalid personal RPC data %j", async data => {
  const { client, rpc } = createClient({}); rpc.mockResolvedValue({ data, error: null });
  await expect(new SupabaseGameRepository(client).listMyGames("owner")).rejects.toThrow();
});
it("rejects personal RPC failures", async () => {
  const { client, rpc } = createClient({}); rpc.mockResolvedValue({ data: [], error: { message: "private" } });
  await expect(new SupabaseGameRepository(client).listMyGames("owner")).rejects.toThrow("Unable to load personal tables");
});
