import { UsageUnavailableError } from "@/lib/usage/errors";
import { admitInference } from "@/lib/usage/admission";
import { BotStepClaimLostError } from "@/lib/poker/bot-step-claims";
import { z } from "zod";
import type { BotHandContext } from "@/lib/poker/bot-history";
import { pokerEngineAdapter } from "@/lib/poker/adapter";
import type { AtomicSeatAssignmentRepository, SeatAssignment, SeatStatus } from "@/lib/poker/seat-contracts";
import "server-only";

import { GAME_FEED_HAND_LIMIT } from "@/lib/constants";
import type {
  AIDifficulty,
  BotDescriptor,
  BotPlaystyleId,
} from "@/lib/poker/types";
import { isBotPlaystyleId } from "@/lib/bots/llm-playstyles";

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
  readonly leaveSeat?: boolean;
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

export interface GamePlayerSeatAssignment extends SeatAssignment {
  readonly name: string;
  readonly bot: BotDescriptor | null;
  readonly aiDifficulty: AIDifficulty | null;
  readonly botProfileId: BotPlaystyleId | null;
  readonly leaving: boolean;
  readonly enginePlayerId: string | null;
}

export interface GameListing {
  readonly isPublic: boolean;
  readonly title: string | null;
  readonly publishedAt: string;
  readonly hostLeaseExpiresAt: string;
}

/** Server-only read model. Never send this snapshot to a browser. */
export interface GameReadSnapshot {
  readonly game: PersistedGame;
  readonly assignments: readonly GamePlayerSeatAssignment[];
  readonly hostToken: string | null;
  readonly listing: GameListing | null;
  readonly revealedPlayerIds: readonly string[];
}

export type { PublicGameDirectoryEntry } from "@/lib/http/discovery-contracts";
import type { PublicGameDirectoryEntry } from "@/lib/http/discovery-contracts";

export type DirectoryJoinResult =
  | { readonly outcome: "joined"; readonly seat: number; readonly version: number; readonly duplicate: boolean }
  | { readonly outcome: "conflict"; readonly version: number }
  | { readonly outcome: "unavailable" };

export interface CreateGameSessionInput extends CreateGameInput {
  readonly hostToken?: string;
  readonly players: readonly {
    readonly enginePlayerId: string | null;
    readonly seat: number;
    readonly name: string;
    readonly controller: "human" | "bot" | "typesafe_ai";
    readonly bot?: BotDescriptor | null;
    readonly aiDifficulty?: AIDifficulty | null;
    readonly botProfileId?: BotPlaystyleId | null;
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
  readonly botProfileId: BotPlaystyleId | null;
}

export interface CompletedAIDecisionInspection {
  readonly actionSequence: number;
  readonly state: unknown;
  readonly legalActions: unknown;
  readonly choice: string;
  readonly probabilities: unknown;
  readonly bot: BotDescriptor;
  readonly botProfileId: BotPlaystyleId | null;
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
  readonly seat: number | null;
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
  readonly initialState: unknown;
  readonly latestState: unknown;
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

export interface FilteredQueryResult extends PromiseLike<DatabaseResult> {
  eq(column: string, value: string | number): FilteredQueryResult;
  maybeSingle(): PromiseLike<MaybeSingleQueryResult>;
}

export interface GameDatabaseClient {
  from(table: "games" | "game_players" | "game_hosts" | "game_listings" | "hand_card_reveals"): {
    insert(values: Record<string, unknown>): {
      select(): {
        single(): PromiseLike<DatabaseResult>;
      };
    };
    select(columns?: string): {
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
      | "acquire_bot_step_claim"
      | "release_bot_step_claim"
      | "commit_bot_action_with_claim"
      | "commit_bot_departure_with_claim"
      | "apply_ai_action_if_version"
      | "apply_ai_action_and_leave_if_version"
      | "create_game_session"
      | "get_game_read_snapshot"
      | "get_hand_history"
      | "get_bot_hand_context"
      | "get_game_feed"
      | "get_game_feed_since"
      | "start_next_hand_if_version"
      | "start_game_if_version"
      | "update_game_state_if_version"
      | "update_seat_count_if_version"
      | "update_table_settings_if_version"
      | "reveal_human_cards_if_version"
      | "list_public_games"
      | "list_public_game_exclusions"
      | "set_game_publication_if_version"
      | "renew_game_listing_lease"
      | "join_public_game_if_version"
      | "claim_game_seat_if_version"
      | "assign_bot_to_seat_if_version"
      | "release_game_seat_if_version",
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
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalAIDifficulty(value: unknown): AIDifficulty | null {
  if (value === null || value === undefined) return null;
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }
  throw new Error("Supabase returned an invalid AI difficulty");
}

function optionalBotProfileId(value: unknown): BotPlaystyleId | null {
  if (value === null || value === undefined) return null;
  if (isBotPlaystyleId(value)) return value;
  throw new Error("Supabase returned an invalid bot playstyle");
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
    (provider !== "typesafe" && provider !== "llm" && provider !== "rules") ||
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

function toDirectoryEntry(value: unknown): PublicGameDirectoryEntry {
  if (!isRecord(value)) {
    throw new Error("Supabase returned an invalid public game entry");
  }
  const title = value.title;
  if (title !== null && typeof title !== "string") {
    throw new Error("Supabase returned an invalid public game title");
  }
  return {
    gameId: requiredString(value, "game_id"),
    title,
    version: requiredNonNegativeInteger(value, "version"),
    occupiedSeats: requiredNonNegativeInteger(value, "occupied_seats"),
    totalSeats: requiredNonNegativeInteger(value, "total_seats"),
    humanCount: requiredNonNegativeInteger(value, "human_count"),
    botCount: requiredNonNegativeInteger(value, "bot_count"),
    smallBlind: requiredNonNegativeInteger(value, "small_blind"),
    bigBlind: requiredNonNegativeInteger(value, "big_blind"),
    startingStack: requiredNonNegativeInteger(value, "starting_stack"),
    publishedAt: requiredString(value, "published_at"),
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
      botProfileId: optionalBotProfileId(item.botProfileId),
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
      botProfileId: optionalBotProfileId(item.botProfileId),
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
    if (item.initialState != null && !isRecord(item.initialState)) {
      throw new Error("Supabase returned an invalid game feed initial state");
    }
    if (item.latestState != null && !isRecord(item.latestState)) {
      throw new Error("Supabase returned an invalid game feed latest state");
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
      const seat = action.seat ?? null;
      if (
        seat !== null &&
        (typeof seat !== "number" || !Number.isInteger(seat) || seat < 0 || seat > 5)
      ) {
        throw new Error("Supabase returned an invalid game feed action seat");
      }
      return {
        seat,
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
      initialState: item.initialState ?? null,
      latestState: item.latestState ?? null,
      actions,
    } satisfies GameFeedHand;
  });
  return { hands };
}

function toSeatAssignments(
  rows: readonly unknown[],
  gameId: string,
): readonly GamePlayerSeatAssignment[] {
  return rows.map((row) => {
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
      botProfileId: optionalBotProfileId(row.bot_profile_id),
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

function toGameListing(data: unknown): GameListing {
  if (
    !isRecord(data) ||
    typeof data.is_public !== "boolean" ||
    (data.title !== null && typeof data.title !== "string")
  ) {
    throw new Error("Supabase returned an invalid game listing");
  }
  return {
    isPublic: data.is_public,
    title: data.title,
    publishedAt: requiredString(data, "published_at"),
    hostLeaseExpiresAt: requiredString(data, "host_lease_expires_at"),
  };
}

export class SupabaseGameRepository {
  constructor(private readonly client: GameDatabaseClient) {}

  async getGameReadSnapshot(gameId: string): Promise<GameReadSnapshot | null> {
    const { data, error } = await this.client.rpc("get_game_read_snapshot", {
      p_game_id: gameId,
    });
    if (error) throw new Error(`Unable to load game snapshot: ${error.message}`);
    if (data === null) return null;
    if (
      !isRecord(data) ||
      !Array.isArray(data.assignments) ||
      !Array.isArray(data.revealed_player_ids) ||
      !data.revealed_player_ids.every((id) => typeof id === "string") ||
      (data.host_token !== null && typeof data.host_token !== "string") ||
      !("listing" in data)
    ) {
      throw new Error("Supabase returned an invalid game snapshot");
    }
    const game = toPersistedGame(data.game);
    if (game.id !== gameId || !isRecord(game.currentState)) {
      throw new Error("Supabase returned an invalid snapshot game");
    }
    for (const row of data.assignments) {
      if (
        !isRecord(row) ||
        row.game_id !== gameId ||
        typeof row.is_host !== "boolean" ||
        typeof row.leaving !== "boolean" ||
        (row.player_token !== null && typeof row.player_token !== "string") ||
        (row.engine_player_id !== null && typeof row.engine_player_id !== "string")
      ) {
        throw new Error("Supabase returned an invalid snapshot assignment");
      }
    }
    const assignments = toSeatAssignments(data.assignments, gameId);
    if (
      assignments.some((assignment, index) =>
        assignment.seat > 5 ||
        (index > 0 && assignments[index - 1].seat >= assignment.seat)
      )
    ) {
      throw new Error("Supabase returned invalid snapshot seat ordering");
    }
    return {
      game,
      assignments,
      hostToken: data.host_token,
      listing: data.listing === null ? null : toGameListing(data.listing),
      revealedPlayerIds: data.revealed_player_ids,
    };
  }

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

    return toSeatAssignments(result.data, gameId);
  }

  async updateSeatAssignment(input: {
    readonly gameId: string;
    readonly seat: number;
    readonly status: SeatStatus;
    readonly name?: string;
    readonly controller?: "human" | "bot" | "typesafe_ai";
    readonly bot?: BotDescriptor | null;
    readonly aiDifficulty?: AIDifficulty | null;
    readonly botProfileId?: BotPlaystyleId | null;
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
    if (input.botProfileId !== undefined) {
      values.bot_profile_id = input.botProfileId;
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

  private async atomicSeatResult(
    functionName: "claim_game_seat_if_version" | "assign_bot_to_seat_if_version" | "release_game_seat_if_version",
    arguments_: Record<string, unknown>,
    gameId: string,
    expectedVersion: number,
    seat: number,
  ): Promise<GamePlayerSeatAssignment> {
    const { data, error } = await this.client.rpc(functionName, arguments_);
    if (error) throw new Error(`Unable to update seat assignment: ${error.message}`);
    if (!isRecord(data) || typeof data.outcome !== "string") throw new Error("Supabase returned an invalid seat mutation result");
    if (data.outcome === "conflict") throw new GameConflictError(gameId, expectedVersion);
    if (data.outcome === "missing") throw new Error("Seat does not exist");
    if (data.outcome === "unavailable") throw new Error("Seat is not open");
    if (data.outcome === "forbidden") throw new Error(functionName === "assign_bot_to_seat_if_version" ? "Only the host can assign bots" : "Seat does not belong to this player");
    if (data.outcome !== "ok") throw new Error("Unable to update seat assignment");
    requiredNonNegativeInteger(data, "version");
    if (!isRecord(data.seat) || data.seat.game_id !== gameId || data.seat.seat !== seat) {
      throw new Error("Supabase returned an invalid seat mutation identity");
    }
    return toSeatAssignments([data.seat], gameId)[0];
  }

  async claimSeatIfVersion(input: Parameters<AtomicSeatAssignmentRepository["claimSeatIfVersion"]>[0]) {
    return this.atomicSeatResult("claim_game_seat_if_version", {
      p_game_id: input.gameId, p_expected_version: input.expectedVersion, p_seat: input.seat,
      p_player_token: input.playerToken, p_name: input.name,
    }, input.gameId, input.expectedVersion, input.seat);
  }

  async assignBotIfVersion(input: Parameters<AtomicSeatAssignmentRepository["assignBotIfVersion"]>[0]) {
    return this.atomicSeatResult("assign_bot_to_seat_if_version", {
      p_game_id: input.gameId, p_expected_version: input.expectedVersion, p_seat: input.seat, p_host_token: input.hostToken,
      p_name: input.name, p_bot_id: input.bot.id, p_bot_label: input.bot.label, p_bot_provider: input.bot.provider,
      p_bot_model_id: input.bot.modelId, p_ai_difficulty: input.aiDifficulty, p_bot_profile_id: input.botProfileId,
    }, input.gameId, input.expectedVersion, input.seat);
  }

  async releaseSeatIfVersion(input: Parameters<AtomicSeatAssignmentRepository["releaseSeatIfVersion"]>[0]) {
    return this.atomicSeatResult("release_game_seat_if_version", {
      p_game_id: input.gameId, p_expected_version: input.expectedVersion,
      p_seat: input.seat, p_player_token: input.playerToken,
    }, input.gameId, input.expectedVersion, input.seat);
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
        if (player.botProfileId !== undefined) {
          row.bot_profile_id = player.botProfileId;
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

  async getGameListing(gameId: string): Promise<GameListing | null> {
    const { data, error } = await this.client
      .from("game_listings")
      .select()
      .eq("game_id", gameId)
      .maybeSingle();
    if (error) throw new Error(`Unable to load game listing: ${error.message}`);
    if (data === null) return null;
    return toGameListing(data);
  }

  async listPublicGames(input: {
    readonly playerToken: string | null;
    readonly cursorPublishedAt?: string | null;
    readonly cursorGameId?: string | null;
    readonly limit?: number;
  }): Promise<readonly PublicGameDirectoryEntry[]> {
    const { data, error } = await this.client.rpc("list_public_games", {
      p_player_token: input.playerToken,
      p_cursor_published_at: input.cursorPublishedAt ?? null,
      p_cursor_game_id: input.cursorGameId ?? null,
      p_limit: input.limit ?? 50,
    });
    if (error) throw new Error(`Unable to list public games: ${error.message}`);
    if (!Array.isArray(data)) throw new Error("Supabase returned an invalid public game directory");
    return data.map(toDirectoryEntry);
  }

  async listPublicGameExclusions(playerToken: string): Promise<readonly string[]> {
    const { data, error } = await this.client.rpc("list_public_game_exclusions", {
      p_player_token: playerToken,
    });
    if (error) throw new Error(`Unable to load public game exclusions: ${error.message}`);
    if (!Array.isArray(data)) throw new Error("Supabase returned invalid public game exclusions");
    return data.map((value) => {
      if (!isRecord(value) || typeof value.game_id !== "string") {
        throw new Error("Supabase returned an invalid public game exclusion");
      }
      return value.game_id;
    });
  }

  async setGamePublication(input: {
    readonly gameId: string;
    readonly expectedVersion: number;
    readonly hostToken: string;
    readonly isPublic: boolean;
    readonly title: string | null;
  }): Promise<PersistedGame> {
    const { data, error } = await this.client.rpc("set_game_publication_if_version", {
      p_game_id: input.gameId,
      p_expected_version: input.expectedVersion,
      p_host_token: input.hostToken,
      p_is_public: input.isPublic,
      p_title: input.title,
    });
    if (error) throw new Error(error.message.includes("NOT_HOST") ? "Only the host can change publication" : error.message);
    if (!Array.isArray(data) || data.length === 0) {
      throw new GameConflictError(input.gameId, input.expectedVersion);
    }
    return toPersistedGame(data[0]);
  }

  async renewGameListingLease(gameId: string, hostToken: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("renew_game_listing_lease", {
      p_game_id: gameId,
      p_host_token: hostToken,
    });
    if (error) throw new Error(`Unable to renew game listing: ${error.message}`);
    if (typeof data !== "boolean") throw new Error("Supabase returned an invalid lease result");
    return data;
  }

  async joinPublicGame(input: {
    readonly gameId: string;
    readonly expectedVersion: number;
    readonly playerToken: string;
    readonly name: string | null;
  }): Promise<DirectoryJoinResult> {
    const { data, error } = await this.client.rpc("join_public_game_if_version", {
      p_game_id: input.gameId,
      p_expected_version: input.expectedVersion,
      p_player_token: input.playerToken,
      p_name: input.name,
    });
    if (error) throw new Error(`Unable to join public game: ${error.message}`);
    if (!isRecord(data) || (data.outcome !== "joined" && data.outcome !== "conflict" && data.outcome !== "unavailable")) {
      throw new Error("Supabase returned an invalid join result");
    }
    if (data.outcome === "unavailable") return { outcome: "unavailable" };
    const version = requiredNonNegativeInteger(data, "version");
    if (data.outcome === "conflict") return { outcome: "conflict", version };
    return {
      outcome: "joined",
      seat: requiredNonNegativeInteger(data, "seat"),
      version,
      duplicate: data.duplicate === true,
    };
  }

  async getBotHandContext(gameId: string, handNumber: number): Promise<BotHandContext | null> {
    const { data, error } = await this.client.rpc("get_bot_hand_context", { p_game_id: gameId, p_hand_number: handNumber });
    if (error) throw new Error(`Unable to load bot hand context: ${error.message}`);
    if (data === null) return null;
    const state = z.object({ stateSchemaVersion: z.literal(1), config: z.object({
      smallBlind: z.number().int().positive(), bigBlind: z.number().int().positive(),
      players: z.array(z.object({ id: z.string(), seat: z.number().int().nonnegative(), name: z.string(),
        controller: z.enum(["human", "bot", "typesafe_ai"]), stack: z.number().int().nonnegative() }).passthrough()),
    }).passthrough(), engineState: z.unknown() }).passthrough().transform(raw => pokerEngineAdapter.restore(raw));
    // Empty historical records explicitly mean unknown; malformed nonempty states fail visibly.
    const legacyState = z.union([z.null(), z.object({}).strict().transform(() => null), state]);
    const action = z.discriminatedUnion("type", [
      z.object({ type: z.literal("fold") }), z.object({ type: z.literal("check") }),
      z.object({ type: z.literal("call"), amount: z.number().int().nonnegative().optional() }),
      z.object({ type: z.literal("bet"), amount: z.number().int().nonnegative() }),
      z.object({ type: z.literal("raise"), amount: z.number().int().nonnegative() }),
    ]);
    const parsed = z.object({ version: z.number().int().nonnegative(), handNumber: z.literal(handNumber),
      initialState: legacyState, actions: z.array(z.object({ sequence: z.number().int().positive(),
        action: z.string(), amount: z.number().int().nonnegative().nullable(), stateBefore: legacyState,
      }).transform(row => ({ sequence: row.sequence, stateBefore: row.stateBefore,
        action: row.action === "all_in" ? null : action.parse({ type: row.action, ...(row.amount === null ? {} : { amount: row.amount }) }) }))),
    }).parse(data);
    return parsed;
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
    sinceHand?: number,
  ): Promise<GameFeed> {
    const { data, error } = await this.client.rpc(
      sinceHand === undefined ? "get_game_feed" : "get_game_feed_since",
      {
        p_game_id: gameId,
        p_hand_limit: handLimit,
        ...(sinceHand === undefined ? {} : { p_since_hand: sinceHand }),
      },
    );
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

  async acquireBotStepClaim(input: { gameId: string; expectedVersion: number; actorEngineId: string; claimToken: string }) {
    const { data, error } = await this.client.rpc("acquire_bot_step_claim", {
      p_game_id: input.gameId, p_expected_version: input.expectedVersion,
      p_actor_engine_id: input.actorEngineId, p_claim_token: input.claimToken,
    });
    if (error) throw new Error("Unable to acquire bot step claim");
    const result = z.discriminatedUnion("outcome", [
      z.object({ outcome: z.literal("acquired") }),
      z.object({ outcome: z.literal("conflict") }),
      z.object({ outcome: z.literal("busy"), retryAfterMs: z.number().int().min(1).max(90_000), expiresAt: z.iso.datetime({ offset: true }) }),
    ]).parse(data);
    if (result.outcome === "conflict") throw new GameConflictError(input.gameId, input.expectedVersion);
    return result;
  }

  async admitExternalBotCall(input: { gameId: string; expectedVersion: number; claimToken: string }): Promise<void> {
    let hostToken: string | null;
    try { hostToken = await this.getHostToken(input.gameId); }
    catch { throw new UsageUnavailableError(); }
    await admitInference(this.client, { ...input, hostToken });
  }

  async releaseBotStepClaim(gameId: string, claimToken: string): Promise<void> {
    const { error } = await this.client.rpc("release_bot_step_claim", { p_game_id: gameId, p_claim_token: claimToken });
    if (error) throw new Error("Unable to release bot step claim");
  }

  async persistClaimedAIAction(input: PersistAIActionInput & { claimToken: string }): Promise<PersistedGame> {
    const claimToken = z.uuid().parse(input.claimToken);
    return this.writeAIAction(input,
      input.leaveSeat ? "commit_bot_departure_with_claim" : "commit_bot_action_with_claim",
      { p_claim_token: claimToken });
  }

  async persistAIAction(input: PersistAIActionInput): Promise<PersistedGame> {
    return this.writeAIAction(input,
      input.leaveSeat ? "apply_ai_action_and_leave_if_version" : "apply_ai_action_if_version", {});
  }

  private async writeAIAction(
    input: PersistAIActionInput,
    functionName: "commit_bot_departure_with_claim" | "commit_bot_action_with_claim" |
      "apply_ai_action_and_leave_if_version" | "apply_ai_action_if_version",
    claimArguments: { p_claim_token: string } | Record<string, never>,
  ): Promise<PersistedGame> {
    const { data, error } = await this.client.rpc(
      functionName,
      {
        ...claimArguments,
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
      if (error.message === "BOT_STEP_CLAIM_LOST") throw new BotStepClaimLostError();
      throw new Error("Unable to persist AI action");
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
      .select("engine_player_id")
      .eq("game_id", gameId)
      .eq("hand_number", handNumber);
    if (result.error) {
      throw new Error(`Unable to load card reveals: ${result.error.message}`);
    }
    if (!Array.isArray(result.data)) return [];
    return result.data.flatMap((row) =>
      isRecord(row) &&
      typeof row.engine_player_id === "string"
        ? [row.engine_player_id]
        : [],
    );
  }
}
