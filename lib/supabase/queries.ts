import "server-only";

import { GAME_FEED_HAND_LIMIT } from "@/lib/constants";
import type { AIDifficulty, BotDescriptor } from "@/lib/poker/types";

export type GameStatus = "waiting" | "playing" | "complete" | "error";

export interface PersistedGame {
  readonly id: string;
  readonly status: GameStatus;
  readonly currentState: unknown;
  readonly stateSchemaVersion: number;
  readonly handNumber: number;
  readonly version: number;
  readonly botsShowUncontestedWins?: boolean;
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

export interface UpdateTableSettingsInput extends UpdateSeatCountInput {
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly startingStack: number;
  readonly botsShowUncontestedWins?: boolean;
}

export interface PersistHumanActionInput extends CompareAndSwapGameInput {
  readonly playerEngineId: string;
  readonly street: "preflop" | "flop" | "turn" | "river";
  readonly action: "fold" | "check" | "call" | "bet" | "raise";
  readonly amount: number | null;
  readonly stateBefore: unknown;
  readonly handComplete: boolean;
  readonly autoRevealPlayerEngineId?: string | null;
  readonly autoRevealReason?: "bot_uncontested" | null;
}

export interface PersistAIActionInput extends PersistHumanActionInput {
  readonly aiState: unknown;
  readonly legalActions: unknown;
  readonly choice: string;
  readonly bot?: BotDescriptor;
  readonly probabilities: Readonly<Record<string, number>> | null;
  readonly confidence: number | null;
  readonly raiseSizeChoice: string | null;
  readonly raiseSizeProbabilities: Readonly<Record<string, number>> | null;
  readonly rawResponse: unknown;
  readonly matchedRule?: string | null;
  readonly promptVersion?: string | null;
  readonly durationMs?: number | null;
  readonly usage?: unknown | null;
  readonly cost?: number | null;
}

export type SeatStatus = "open" | "claimed" | "bot";

export interface GamePlayerSeatAssignment {
  readonly gameId: string;
  readonly seat: number;
  readonly name: string;
  readonly status: SeatStatus;
  readonly controller: "human" | "bot";
  readonly bot: BotDescriptor | null;
  readonly aiDifficulty: AIDifficulty | null;
  readonly playerToken: string | null;
  readonly isHost: boolean;
  readonly leaving: boolean;
  readonly enginePlayerId: string | null;
}

export interface CreateGameSessionInput extends CreateGameInput {
  readonly hostToken?: string;
  readonly players: readonly {
    readonly enginePlayerId: string | null;
    readonly seat: number;
    readonly name: string;
    readonly controller: "human" | "bot" | "typesafe_ai";
    readonly bot?: BotDescriptor | null;
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
  readonly controller: "human" | "bot";
  readonly bot: BotDescriptor | null;
}

export interface CompletedAIDecisionInspection {
  readonly actionSequence: number;
  readonly state: unknown;
  readonly legalActions: unknown;
  readonly choice: string;
  readonly probabilities: unknown;
  readonly bot: BotDescriptor;
  readonly confidence: number | null;
  readonly raiseSizeChoice: string | null;
  readonly raiseSizeProbabilities: unknown;
  readonly rawResponse: unknown;
  readonly matchedRule: string | null;
  readonly promptVersion: string | null;
  readonly durationMs: number | null;
  readonly usage: unknown | null;
  readonly cost: number | null;
}

export interface HandHistory {
  readonly status: "playing" | "complete" | "error";
  readonly actions: readonly HandActionHistoryItem[];
  readonly aiDecisions: readonly CompletedAIDecisionInspection[];
}

/**
 * Slim, player-facing counterpart to `HandActionHistoryItem`: no bot
 * inspection detail, used to render the always-visible action feed panel
 * rather than the debug history modal.
 */
export interface GameFeedActionItem {
  readonly sequence: number;
  readonly street: "preflop" | "flop" | "turn" | "river";
  readonly action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  readonly amount: number | null;
  readonly player: string;
  readonly controller: "human" | "bot";
}

export interface GameFeedHand {
  readonly handNumber: number;
  readonly status: "playing" | "complete" | "error";
  readonly finalState: unknown;
  readonly actions: readonly GameFeedActionItem[];
}

export interface GameFeed {
  readonly hands: readonly GameFeedHand[];
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
  from(table: "games" | "game_players" | "game_hosts" | "hand_card_reveals"): {
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
      | "get_game_feed"
      | "start_next_hand_if_version"
      | "start_game_if_version"
      | "update_game_state_if_version"
      | "update_seat_count_if_version"
      | "update_table_settings_if_version"
      | "reveal_human_cards_if_version",
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

const legacyJevBot: BotDescriptor = {
  id: "jev",
  label: "TypeSafe Jev",
  provider: "typesafe",
  modelId: "jev-latest",
};

function botDescriptorFrom(
  record: Record<string, unknown>,
  style: "snake" | "camel",
): BotDescriptor | null {
  const id = record[style === "snake" ? "bot_id" : "botId"];
  const label = record[style === "snake" ? "bot_label" : "botLabel"];
  const provider = record[style === "snake" ? "bot_provider" : "botProvider"];
  const modelId = record[style === "snake" ? "bot_model_id" : "botModelId"];
  if (id === null || id === undefined) return null;
  if (
    typeof id !== "string" ||
    typeof label !== "string" ||
    (provider !== "typesafe" &&
      provider !== "openrouter" &&
      provider !== "rules") ||
    (modelId !== null && modelId !== undefined && typeof modelId !== "string")
  ) {
    throw new Error("Supabase returned an invalid bot descriptor");
  }
  return {
    id,
    label,
    provider,
    modelId: typeof modelId === "string" ? modelId : null,
  };
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
    botsShowUncontestedWins: value.bots_show_uncontested_wins === true,
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
      (controller !== "human" &&
        controller !== "bot" &&
        controller !== "typesafe_ai")
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
      controller: controller === "human" ? "human" : "bot",
      bot:
        controller === "human"
          ? null
          : (botDescriptorFrom(item, "camel") ?? legacyJevBot),
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
    if (
      confidence !== null &&
      (typeof confidence !== "number" || confidence < 0 || confidence > 1)
    ) {
      throw new Error("Supabase returned an invalid AI confidence");
    }
    return {
      actionSequence: requiredInteger(item, "actionSequence"),
      state: item.state,
      legalActions: item.legalActions,
      choice: requiredString(item, "choice"),
      probabilities: item.probabilities,
      bot: botDescriptorFrom(item, "camel") ?? legacyJevBot,
      confidence,
      raiseSizeChoice,
      raiseSizeProbabilities: item.raiseSizeProbabilities,
      rawResponse: item.rawResponse,
      matchedRule:
        typeof item.matchedRule === "string" ? item.matchedRule : null,
      promptVersion:
        typeof item.promptVersion === "string" ? item.promptVersion : null,
      durationMs: typeof item.durationMs === "number" ? item.durationMs : null,
      usage: item.usage ?? null,
      cost: typeof item.cost === "number" ? item.cost : null,
    };
  });
  return { status, actions, aiDecisions };
}

function toGameFeed(value: unknown): GameFeed {
  if (!Array.isArray(value)) {
    throw new Error("Supabase returned an invalid game feed");
  }
  const hands = value.map((item) => {
    if (!isRecord(item))
      throw new Error("Supabase returned an invalid game feed hand");
    const status = requiredString(item, "status");
    if (status !== "playing" && status !== "complete" && status !== "error") {
      throw new Error("Supabase returned an invalid game feed hand status");
    }
    if (!Array.isArray(item.actions)) {
      throw new Error("Supabase returned invalid game feed actions");
    }
    const actions = item.actions.map((action) => {
      if (!isRecord(action))
        throw new Error("Supabase returned an invalid game feed action");
      const street = requiredString(action, "street");
      const actionType = requiredString(action, "action");
      const controller = requiredString(action, "controller");
      if (
        !["preflop", "flop", "turn", "river"].includes(street) ||
        !["fold", "check", "call", "bet", "raise", "all_in"].includes(
          actionType,
        ) ||
        (controller !== "human" &&
          controller !== "bot" &&
          controller !== "typesafe_ai")
      ) {
        throw new Error(
          "Supabase returned an invalid game feed action domain value",
        );
      }
      const amount = action.amount;
      if (
        amount !== null &&
        (typeof amount !== "number" ||
          !Number.isSafeInteger(amount) ||
          amount < 0)
      ) {
        throw new Error("Supabase returned an invalid game feed action amount");
      }
      return {
        sequence: requiredInteger(action, "sequence"),
        street,
        action: actionType,
        amount,
        player: requiredString(action, "player"),
        controller: controller === "human" ? "human" : "bot",
      } as GameFeedActionItem;
    });
    return {
      handNumber: requiredInteger(item, "handNumber"),
      status,
      finalState: item.finalState ?? null,
      actions,
    } satisfies GameFeedHand;
  });
  return { hands };
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
      if (
        controller !== "human" &&
        controller !== "bot" &&
        controller !== "typesafe_ai"
      ) {
        throw new Error("Supabase returned an invalid player controller");
      }

      return {
        gameId,
        seat: requiredNonNegativeInteger(row, "seat"),
        name: requiredString(row, "name"),
        status,
        controller: controller === "human" ? "human" : "bot",
        bot:
          controller === "human"
            ? null
            : (botDescriptorFrom(row, "snake") ?? legacyJevBot),
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
    readonly controller?: "human" | "bot" | "typesafe_ai";
    readonly bot?: BotDescriptor | null;
    readonly aiDifficulty?: AIDifficulty | null;
    readonly playerToken?: string | null;
    readonly isHost?: boolean;
    readonly leaving?: boolean;
    readonly enginePlayerId?: string | null;
  }): Promise<void> {
    const values: Record<string, unknown> = { status: input.status };
    if (input.name !== undefined) values.name = input.name;
    if (input.controller !== undefined) {
      values.controller =
        input.controller === "typesafe_ai" ? "bot" : input.controller;
    }
    if (input.bot !== undefined) {
      values.bot_id = input.bot?.id ?? null;
      values.bot_label = input.bot?.label ?? null;
      values.bot_provider = input.bot?.provider ?? null;
      values.bot_model_id = input.bot?.modelId ?? null;
    }
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
      p_host_token: input.hostToken ?? null,
      p_players: input.players.map((player) => {
        const row: Record<string, unknown> = {
          engine_player_id: player.enginePlayerId,
          seat: player.seat,
          name: player.name,
          controller:
            player.controller === "typesafe_ai" ? "bot" : player.controller,
          stack: player.stack,
        };

        const bot =
          player.controller === "typesafe_ai"
            ? legacyJevBot
            : (player.bot ?? null);
        if (bot) {
          row.bot_id = bot.id;
          row.bot_label = bot.label;
          row.bot_provider = bot.provider;
          row.bot_model_id = bot.modelId;
        }

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

  async getHostToken(gameId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("game_hosts")
      .select()
      .eq("game_id", gameId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load game host: ${error.message}`);
    }
    if (data === null) return null;
    if (!isRecord(data) || typeof data.host_token !== "string") {
      throw new Error("Supabase returned an invalid game host");
    }
    return data.host_token;
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

  async getGameFeed(
    gameId: string,
    handLimit: number = GAME_FEED_HAND_LIMIT,
  ): Promise<GameFeed> {
    const { data, error } = await this.client.rpc("get_game_feed", {
      p_game_id: gameId,
      p_hand_limit: handLimit,
    });
    if (error) {
      throw new Error(`Unable to load game feed: ${error.message}`);
    }
    return toGameFeed(data);
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

  async updateTableSettings(
    input: UpdateTableSettingsInput,
  ): Promise<PersistedGame> {
    const { data, error } = await this.client.rpc(
      "update_table_settings_if_version",
      {
        p_game_id: input.gameId,
        p_expected_version: input.expectedVersion,
        p_seat_count: input.seatCount,
        p_small_blind: input.smallBlind,
        p_big_blind: input.bigBlind,
        p_starting_stack: input.startingStack,
        p_bots_show_uncontested_wins: input.botsShowUncontestedWins,
        p_current_state: input.currentState,
        p_state_schema_version: input.stateSchemaVersion,
      },
    );

    if (error) {
      throw new Error(`Unable to update table settings: ${error.message}`);
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
        p_auto_reveal_player_engine_id: input.autoRevealPlayerEngineId ?? null,
        p_auto_reveal_reason: input.autoRevealReason ?? null,
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
        p_bot_id: (input.bot ?? legacyJevBot).id,
        p_bot_label: (input.bot ?? legacyJevBot).label,
        p_bot_provider: (input.bot ?? legacyJevBot).provider,
        p_bot_model_id: (input.bot ?? legacyJevBot).modelId,
        p_probabilities: input.probabilities,
        p_confidence: input.confidence,
        p_raise_size_choice: input.raiseSizeChoice,
        p_raise_size_probabilities: input.raiseSizeProbabilities,
        p_raw_response: input.rawResponse,
        p_matched_rule: input.matchedRule ?? null,
        p_prompt_version: input.promptVersion ?? null,
        p_duration_ms: input.durationMs ?? null,
        p_usage: input.usage ?? null,
        p_cost: input.cost ?? null,
        p_auto_reveal_player_engine_id: input.autoRevealPlayerEngineId ?? null,
        p_auto_reveal_reason: input.autoRevealReason ?? null,
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

  async revealHumanCards(input: {
    readonly gameId: string;
    readonly handNumber: number;
    readonly expectedVersion: number;
    readonly playerToken: string;
  }): Promise<PersistedGame> {
    const { data, error } = await this.client.rpc(
      "reveal_human_cards_if_version",
      {
        p_game_id: input.gameId,
        p_hand_number: input.handNumber,
        p_expected_version: input.expectedVersion,
        p_player_token: input.playerToken,
      },
    );
    if (error)
      throw new Error(`Unable to reveal human cards: ${error.message}`);
    if (!Array.isArray(data) || data.length === 0) {
      throw new GameConflictError(input.gameId, input.expectedVersion);
    }
    return toPersistedGame(data[0]);
  }

  async getCurrentHandRevealedPlayerIds(
    gameId: string,
    handNumber: number,
  ): Promise<readonly string[]> {
    const result = await this.client
      .from("hand_card_reveals")
      .select()
      .eq("game_id", gameId);
    if (result.error) {
      throw new Error(`Unable to load card reveals: ${result.error.message}`);
    }
    if (!Array.isArray(result.data)) return [];
    return result.data.flatMap((row) =>
      isRecord(row) &&
      row.hand_number === handNumber &&
      typeof row.engine_player_id === "string"
        ? [row.engine_player_id]
        : [],
    );
  }
}
