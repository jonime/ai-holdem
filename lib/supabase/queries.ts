import "server-only";

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

export interface CreateGameSessionInput extends CreateGameInput {
  readonly players: readonly {
    readonly enginePlayerId: string;
    readonly seat: number;
    readonly name: string;
    readonly controller: "human" | "typesafe_ai";
    readonly stack: number;
  }[];
}

interface DatabaseResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

export interface GameDatabaseClient {
  from(table: "games"): {
    insert(values: Record<string, unknown>): {
      select(): {
        single(): PromiseLike<DatabaseResult>;
      };
    };
    select(): {
      eq(
        column: "id",
        value: string,
      ): {
        maybeSingle(): PromiseLike<DatabaseResult>;
      };
    };
  };
  rpc(
    functionName:
      | "apply_human_action_if_version"
      | "apply_ai_action_if_version"
      | "create_game_session"
      | "start_next_hand_if_version"
      | "update_game_state_if_version",
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

export class SupabaseGameRepository {
  constructor(private readonly client: GameDatabaseClient) {}

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
      p_players: input.players.map((player) => ({
        engine_player_id: player.enginePlayerId,
        seat: player.seat,
        name: player.name,
        controller: player.controller,
        stack: player.stack,
      })),
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
