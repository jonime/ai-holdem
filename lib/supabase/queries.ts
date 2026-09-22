import "server-only";

import type { AIDifficulty } from "@/lib/poker/types";

export type GameStatus = "waiting" | "playing" | "complete" | "error";

export interface PersistedGame {
  readonly id: string;
  readonly status: GameStatus;
  readonly currentState: unknown;
  readonly stateSchemaVersion: number;
  readonly handNumber: number;
  readonly version: number;
}

export interface CreateGameInput {
  readonly currentState: unknown;
  readonly stateSchemaVersion: number;
  readonly handNumber: number;
  readonly status: GameStatus;
}

export interface CompareAndSwapGameInput extends CreateGameInput {
  readonly gameId: string;
  readonly expectedVersion: number;
}

export interface StartNextHandInput {
  readonly gameId: string;
  readonly expectedVersion: number;
  readonly currentState: unknown;
  readonly stateSchemaVersion: number;
  readonly handNumber: number;
}

export interface UpdateSeatCountInput {
  readonly gameId: string;
  readonly expectedVersion: number;
  readonly seatCount: number;
  readonly currentState: unknown;
  readonly stateSchemaVersion: number;
}

export interface PersistHumanActionInput extends CompareAndSwapGameInput {
  readonly playerEngineId: string;
  readonly street: "preflop" | "flop" | "turn" | "river";
  readonly action: "fold" | "check" | "call" | "bet" | "raise";
  readonly amount: number | null;
  readonly stateBefore: unknown;
  readonly handComplete: boolean;
}

export interface PersistAIActionInput extends PersistHumanActionInput {
  readonly aiState: unknown;
  readonly legalActions: unknown;
  readonly choice: string;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number;
  readonly raiseSizeChoice: string | null;
  readonly raiseSizeProbabilities: Readonly<Record<string, number>> | null;
  readonly rawResponse: unknown;
}

export type SeatStatus = "open" | "claimed" | "bot";

export interface GamePlayerSeatAssignment {
  readonly gameId: string;
  readonly seat: number;
  readonly name: string;
  readonly status: SeatStatus;
  readonly controller: "human" | "typesafe_ai";
  readonly aiDifficulty: AIDifficulty | null;
  readonly playerToken: string | null;
  readonly isHost: boolean;
  readonly leaving: boolean;
  readonly enginePlayerId: string | null;
}

export interface CreateGameSessionInput extends CreateGameInput {
  readonly players: readonly {
    readonly enginePlayerId: string | null;
    readonly seat: number;
    readonly name: string;
    readonly controller: "human" | "typesafe_ai";
    readonly aiDifficulty?: AIDifficulty | null;
    readonly stack: number;
    readonly status?: SeatStatus;
    readonly playerToken?: string | null;
    readonly isHost?: boolean;
    readonly leaving?: boolean;
  }[];
}

export interface HandActionHistoryItem {
  readonly sequence: number;
  readonly street: "preflop" | "flop" | "turn" | "river";
  readonly action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  readonly amount: number | null;
  readonly player: string;
  readonly controller: "human" | "typesafe_ai";
}

export interface CompletedAIDecisionInspection {
  readonly actionSequence: number;
  readonly state: unknown;
  readonly legalActions: unknown;
  readonly choice: string;
  readonly probabilities: unknown;
  readonly confidence: number;
  readonly raiseSizeChoice: string | null;
  readonly raiseSizeProbabilities: unknown;
  readonly rawResponse: unknown;
}

export interface HandHistory {
  readonly status: "playing" | "complete" | "error";
  readonly actions: readonly HandActionHistoryItem[];
  readonly aiDecisions: readonly CompletedAIDecisionInspection[];
}

interface DatabaseResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

interface MaybeSingleQueryResult extends DatabaseResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

interface FilteredQueryResult extends PromiseLike<DatabaseResult> {
  maybeSingle(): PromiseLike<MaybeSingleQueryResult>;
}

export interface GameDatabaseClient {
  from(table: "games" | "game_players"): {
    insert(values: Record<string, unknown>): {
      select(): {
        single(): PromiseLike<DatabaseResult>;
      };
    };
    select(): {
      eq(column: string, value: string | number): FilteredQueryResult;
    };
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: string | number,
      ): {
        eq(
          column: string,
          value: string | number,
        ): {
          select(): {
            single(): PromiseLike<DatabaseResult>;
          };
        };
      };
    };
  };
  rpc(
    functionName:
      | "apply_human_action_if_version"
      | "apply_ai_action_if_version"
      | "create_game_session"
      | "get_hand_history"
      | "start_next_hand_if_version"
      | "start_game_if_version"
      | "update_game_state_if_version"
      | "update_seat_count_if_version",
    arguments_: Record<string, unknown>,
  ): PromiseLike<DatabaseResult>;
}

export class GameConflictError extends Error {
  constructor(gameId: string, expectedVersion: number) {
    super(
      `Game ${gameId} was updated before version ${expectedVersion} could be saved`,
    );
    this.name = "GameConflictError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalAIDifficulty(value: unknown): AIDifficulty | null {
  if (value === null || value === undefined) return null;
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }
  throw new Error("Supabase returned an invalid AI difficulty");
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`Supabase returned an invalid game ${key}`);
  }
  return value;
}

function requiredNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Supabase returned an invalid game ${key}`);
  }
  return value;
}

function toPersistedGame(value: unknown): PersistedGame {
  if (!isRecord(value)) {
    throw new Error("Supabase returned an invalid game record");
  }

  const status = requiredString(value, "status");
  if (
    status !== "waiting" &&
    status !== "playing" &&
    status !== "complete" &&
    status !== "error"
  ) {
    throw new Error("Supabase returned an invalid game status");
  }

  return {
    id: requiredString(value, "id"),
    status,
    currentState: value.current_state,
    stateSchemaVersion: requiredNonNegativeInteger(
      value,
      "state_schema_version",
    ),
    handNumber: requiredNonNegativeInteger(value, "hand_number"),
    version: requiredNonNegativeInteger(value, "version"),
  };
}

function requiredInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Supabase returned an invalid hand history ${key}`);
  }
  return value;
}

function toHandHistory(value: unknown): HandHistory | null {
  if (value === null) return null;
  if (!isRecord(value))
    throw new Error("Supabase returned an invalid hand history");
  const status = requiredString(value, "status");
  if (status !== "playing" && status !== "complete" && status !== "error") {
    throw new Error("Supabase returned an invalid hand status");
  }
  if (!Array.isArray(value.actions)) {
    throw new Error("Supabase returned invalid hand actions");
  }
  const actions = value.actions.map((item) => {
    if (!isRecord(item))
      throw new Error("Supabase returned an invalid hand action");
    const street = requiredString(item, "street");
    const action = requiredString(item, "action");
    const controller = requiredString(item, "controller");
    if (
      !["preflop", "flop", "turn", "river"].includes(street) ||
      !["fold", "check", "call", "bet", "raise", "all_in"].includes(action) ||
      (controller !== "human" && controller !== "typesafe_ai")
    ) {
      throw new Error("Supabase returned an invalid hand action domain value");
    }
    const amount = item.amount;
    if (
      amount !== null &&
      (typeof amount !== "number" ||
        !Number.isSafeInteger(amount) ||
        amount < 0)
    ) {
      throw new Error("Supabase returned an invalid hand action amount");
    }
    return {
      sequence: requiredInteger(item, "sequence"),
      street,
      action,
      amount,
      player: requiredString(item, "player"),
      controller,
    } as HandActionHistoryItem;
  });

  if (status !== "complete") {
    return { status, actions, aiDecisions: [] };
  }
  if (!Array.isArray(value.aiDecisions)) {
    throw new Error("Supabase returned invalid AI decision history");
  }
  const aiDecisions = value.aiDecisions.map((item) => {
    if (!isRecord(item))
      throw new Error("Supabase returned an invalid AI decision");
    const raiseSizeChoice = item.raiseSizeChoice;
    if (raiseSizeChoice !== null && typeof raiseSizeChoice !== "string") {
      throw new Error("Supabase returned an invalid AI sizing choice");
    }
    const confidence = item.confidence;
    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
      throw new Error("Supabase returned an invalid AI confidence");
    }
    return {
      actionSequence: requiredInteger(item, "actionSequence"),
      state: item.state,
      legalActions: item.legalActions,
      choice: requiredString(item, "choice"),
      probabilities: item.probabilities,
      confidence,
      raiseSizeChoice,
      raiseSizeProbabilities: item.raiseSizeProbabilities,
      rawResponse: item.rawResponse,
    };
  });
  return { status, actions, aiDecisions };
}

export class SupabaseGameRepository {
  constructor(private readonly client: GameDatabaseClient) {}

  async getSeatAssignments(
    gameId: string,
  ): Promise<readonly GamePlayerSeatAssignment[]> {
    const result = await this.client
      .from("game_players")
      .select()
      .eq("game_id", gameId);

    if (result.error) {
      throw new Error(
        `Unable to load seat assignments: ${result.error.message}`,
      );
    }

    if (!Array.isArray(result.data)) {
      return [];
    }

    return result.data.map((row) => {
      if (!isRecord(row)) {
        throw new Error("Supabase returned an invalid seat assignment");
      }
      const status = requiredString(row, "status");
      if (status !== "open" && status !== "claimed" && status !== "bot") {
        throw new Error("Supabase returned an invalid seat status");
      }
      const controller = requiredString(row, "controller");
      if (controller !== "human" && controller !== "typesafe_ai") {
        throw new Error("Supabase returned an invalid player controller");
      }

      return {
        gameId,
        seat: requiredNonNegativeInteger(row, "seat"),
        name: requiredString(row, "name"),
        status,
        controller,
        aiDifficulty: optionalAIDifficulty(row.ai_difficulty),
        playerToken:
          typeof row.player_token === "string" ? row.player_token : null,
        isHost: Boolean(row.is_host),
        leaving: Boolean(row.leaving),
        enginePlayerId:
          typeof row.engine_player_id === "string"
            ? row.engine_player_id
            : null,
      } satisfies GamePlayerSeatAssignment;
    });
  }

  async updateSeatAssignment(input: {
    readonly gameId: string;
    readonly seat: number;
    readonly status: SeatStatus;
    readonly name?: string;
    readonly controller?: "human" | "typesafe_ai";
    readonly aiDifficulty?: AIDifficulty | null;
    readonly playerToken?: string | null;
    readonly isHost?: boolean;
    readonly leaving?: boolean;
    readonly enginePlayerId?: string | null;
  }): Promise<void> {
    const values: Record<string, unknown> = { status: input.status };
    if (input.name !== undefined) values.name = input.name;
    if (input.controller !== undefined) values.controller = input.controller;
    if (input.aiDifficulty !== undefined) {
      values.ai_difficulty = input.aiDifficulty;
    }
    if (input.playerToken !== undefined) {
      values.player_token = input.playerToken;
    }
    if (input.isHost !== undefined) values.is_host = input.isHost;
    if (input.leaving !== undefined) values.leaving = input.leaving;
    if (input.enginePlayerId !== undefined) {
      values.engine_player_id = input.enginePlayerId;
    }
    const { error } = await this.client
      .from("game_players")
      .update(values)
      .eq("game_id", input.gameId)
      .eq("seat", input.seat)
      .select()
      .single();

    if (error) {
      throw new Error(`Unable to update seat assignment: ${error.message}`);
    }
  }

  async createGame(input: CreateGameInput): Promise<PersistedGame> {
    const { data, error } = await this.client
      .from("games")
      .insert({
        current_state: input.currentState,
        state_schema_version: input.stateSchemaVersion,
        hand_number: input.handNumber,
        status: input.status,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Unable to create game: ${error.message}`);
    }

    return toPersistedGame(data);
  }

  async createGameSession(
    input: CreateGameSessionInput,
  ): Promise<PersistedGame> {
    const { data, error } = await this.client.rpc("create_game_session", {
      p_current_state: input.currentState,
      p_state_schema_version: input.stateSchemaVersion,
      p_hand_number: input.handNumber,
      p_status: input.status,
      p_players: input.players.map((player) => {
        const row: Record<string, unknown> = {
          engine_player_id: player.enginePlayerId,
          seat: player.seat,
          name: player.name,
          controller: player.controller,
          stack: player.stack,
        };

        if (player.status !== undefined) {
          row.status = player.status;
        }
        if (player.aiDifficulty !== undefined) {
          row.ai_difficulty = player.aiDifficulty;
        }
        if (player.playerToken !== undefined) {
          row.player_token = player.playerToken;
        }
        if (player.isHost !== undefined) {
          row.is_host = player.isHost;
        }
        if (player.leaving !== undefined) {
          row.leaving = player.leaving;
        }

        return row;
      }),
    });

    if (error) {
      throw new Error(`Unable to create game session: ${error.message}`);
    }

    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error("Supabase did not create exactly one game session");
    }

    return toPersistedGame(data[0]);
  }

  async getGame(gameId: string): Promise<PersistedGame | null> {
    const { data, error } = await this.client
      .from("games")
      .select()
      .eq("id", gameId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load game: ${error.message}`);
    }

    return data === null ? null : toPersistedGame(data);
  }

  async getHandHistory(
    gameId: string,
    handNumber: number,
  ): Promise<HandHistory | null> {
    const { data, error } = await this.client.rpc("get_hand_history", {
      p_game_id: gameId,
      p_hand_number: handNumber,
    });
    if (error) {
      throw new Error(`Unable to load hand history: ${error.message}`);
    }
    return toHandHistory(data);
  }

  async compareAndSwapGame(
    input: CompareAndSwapGameInput,
  ): Promise<PersistedGame> {
    const { data, error } = await this.client.rpc(
      "update_game_state_if_version",
      {
        p_game_id: input.gameId,
        p_expected_version: input.expectedVersion,
        p_current_state: input.currentState,
        p_status: input.status,
        p_hand_number: input.handNumber,
        p_state_schema_version: input.stateSchemaVersion,
      },
    );

    if (error) {
      throw new Error(`Unable to update game: ${error.message}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new GameConflictError(input.gameId, input.expectedVersion);
    }

    return toPersistedGame(data[0]);
  }

  async startNextHand(input: StartNextHandInput): Promise<PersistedGame> {
    const { data, error } = await this.client.rpc(
      "start_next_hand_if_version",
      {
        p_game_id: input.gameId,
        p_expected_version: input.expectedVersion,
        p_current_state: input.currentState,
        p_hand_number: input.handNumber,
        p_state_schema_version: input.stateSchemaVersion,
      },
    );

    if (error) {
      throw new Error(`Unable to start next hand: ${error.message}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new GameConflictError(input.gameId, input.expectedVersion);
    }

    return toPersistedGame(data[0]);
  }

  async startGame(input: StartNextHandInput): Promise<PersistedGame> {
    const { data, error } = await this.client.rpc("start_game_if_version", {
      p_game_id: input.gameId,
      p_expected_version: input.expectedVersion,
      p_current_state: input.currentState,
      p_hand_number: input.handNumber,
      p_state_schema_version: input.stateSchemaVersion,
    });

    if (error) {
      throw new Error(`Unable to start game: ${error.message}`);
    }
    if (!Array.isArray(data) || data.length === 0) {
      throw new GameConflictError(input.gameId, input.expectedVersion);
    }
    return toPersistedGame(data[0]);
  }

  async updateSeatCount(input: UpdateSeatCountInput): Promise<PersistedGame> {
    const { data, error } = await this.client.rpc(
      "update_seat_count_if_version",
      {
        p_game_id: input.gameId,
        p_expected_version: input.expectedVersion,
        p_seat_count: input.seatCount,
        p_current_state: input.currentState,
        p_state_schema_version: input.stateSchemaVersion,
      },
    );

    if (error) {
      throw new Error(`Unable to update seat count: ${error.message}`);
    }
    if (!Array.isArray(data) || data.length === 0) {
      throw new GameConflictError(input.gameId, input.expectedVersion);
    }
    return toPersistedGame(data[0]);
  }

  async persistHumanAction(
    input: PersistHumanActionInput,
  ): Promise<PersistedGame> {
    const { data, error } = await this.client.rpc(
      "apply_human_action_if_version",
      {
        p_game_id: input.gameId,
        p_expected_version: input.expectedVersion,
        p_player_engine_id: input.playerEngineId,
        p_current_state: input.currentState,
        p_status: input.status,
        p_hand_number: input.handNumber,
        p_state_schema_version: input.stateSchemaVersion,
        p_street: input.street,
        p_action: input.action,
        p_amount: input.amount,
        p_state_before: input.stateBefore,
        p_state_after: input.currentState,
        p_hand_complete: input.handComplete,
      },
    );

    if (error) {
      throw new Error(`Unable to persist human action: ${error.message}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new GameConflictError(input.gameId, input.expectedVersion);
    }

    return toPersistedGame(data[0]);
  }

  async persistAIAction(input: PersistAIActionInput): Promise<PersistedGame> {
    const { data, error } = await this.client.rpc(
      "apply_ai_action_if_version",
      {
        p_game_id: input.gameId,
        p_expected_version: input.expectedVersion,
        p_player_engine_id: input.playerEngineId,
        p_current_state: input.currentState,
        p_status: input.status,
        p_hand_number: input.handNumber,
        p_state_schema_version: input.stateSchemaVersion,
        p_street: input.street,
        p_action: input.action,
        p_amount: input.amount,
        p_state_before: input.stateBefore,
        p_state_after: input.currentState,
        p_hand_complete: input.handComplete,
        p_ai_state: input.aiState,
        p_legal_actions: input.legalActions,
        p_choice: input.choice,
        p_probabilities: input.probabilities,
        p_confidence: input.confidence,
        p_raise_size_choice: input.raiseSizeChoice,
        p_raise_size_probabilities: input.raiseSizeProbabilities,
        p_raw_response: input.rawResponse,
      },
    );

    if (error) {
      throw new Error(`Unable to persist AI action: ${error.message}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new GameConflictError(input.gameId, input.expectedVersion);
    }

    return toPersistedGame(data[0]);
  }
}
