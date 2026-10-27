import "server-only";
import type { Database, Json, TablesInsert } from "./database.generated";
import type { DepartureFold } from "@/lib/poker/departure-contracts";
import type { pokerEngineAdapter } from "@/lib/poker/adapter";

type Functions = Database["public"]["Functions"];
export type RpcName = keyof Functions;
// PostgreSQL function argument nullability is not represented by the generator.
// These are the existing SQL-supported null inputs, not nullable identifiers.
type ActionName = "apply_human_action_if_version" | "apply_ai_action_if_version" |
  "apply_ai_action_and_leave_if_version" | "commit_bot_action_with_claim" | "commit_bot_departure_with_claim";
type NullableKeys<N extends RpcName> = N extends ActionName
  ? "p_amount" | "p_auto_reveal_player_engine_id" | "p_auto_reveal_reason" | "p_bot_id" | "p_bot_label" | "p_bot_model_id" | "p_bot_provider" | "p_confidence" | "p_cost" | "p_duration_ms" | "p_matched_rule" | "p_prompt_version" | "p_raise_size_choice"
  : N extends "create_game_session" ? "p_host_token"
  : N extends "assign_bot_to_seat_if_version" ? "p_ai_difficulty" | "p_bot_model_id" | "p_bot_profile_id"
  : N extends "claim_game_seat_if_version" | "join_public_game_if_version" ? "p_name"
  : N extends "list_public_games" ? "p_player_token" | "p_cursor_game_id" | "p_cursor_published_at"
  : N extends "edit_replay_share_title" ? "p_title"
  : N extends "set_game_publication_if_version" ? "p_title"
  : N extends "commit_with_turn_timer" ? "p_decision_id" | "p_driver_token" : never;
type SqlArgs<N extends RpcName> = {
  [K in keyof Functions[N]["Args"]]: Functions[N]["Args"][K] | (K extends NullableKeys<N> ? null : never)
};
export type CreationPlayer = Pick<TablesInsert<"game_players">,
  "engine_player_id" | "seat" | "name" | "controller" | "stack" | "status" | "ai_difficulty" |
  "bot_profile_id" | "player_token" | "is_host" | "leaving" | "bot_id" | "bot_label" | "bot_provider" | "bot_model_id">;
export type TimerTransition = ReturnType<typeof pokerEngineAdapter.timerTransition>;
export type CreationArgs = Omit<SqlArgs<"create_game_session">, "p_players"> & { p_players: CreationPlayer[] };
export type CreationAttempt = Omit<SqlArgs<"create_game_with_attempt">, "p_arguments" | "p_transition">;
export type TimerOperation = "create_game_session" | "start_game_if_version" | "start_next_hand_if_version" |
  "update_table_settings_if_version" | "update_seat_count_if_version" | "apply_human_action_if_version" |
  "apply_ai_action_if_version" | "apply_ai_action_and_leave_if_version" | "commit_bot_action_with_claim" |
  "commit_bot_departure_with_claim" | "advance_departure_if_version" | "depart_game_seat_if_version" |
  "remove_game_if_version" | "reveal_human_cards_if_version" | "set_game_publication_if_version";
export type DeparturePayload = Omit<DepartureFold, "currentState" | "stateBefore"> & { currentState: Json; stateBefore: Json };
type ArgumentMap = { [N in RpcName]: N extends "create_game_session" ? CreationArgs
  : N extends "commit_with_turn_timer" ? TimerCommit
  : N extends "create_game_with_attempt" ? CreationAttempt & { p_arguments: CreationArgs; p_transition?: TimerTransition | null }
  : N extends "advance_departure_if_version" ? Omit<SqlArgs<N>, "p_fold"> & { p_fold: DeparturePayload }
  : N extends "depart_game_seat_if_version" | "remove_game_if_version"
    ? Omit<SqlArgs<N>, "p_fold"> & { p_fold?: DeparturePayload | null }
  : SqlArgs<N> };
export type RpcArgs<N extends RpcName> = ServerDatabase["public"]["Functions"][N]["Args"];
export type TimerCommit = { [N in TimerOperation]: Omit<SqlArgs<"commit_with_turn_timer">, "p_operation" | "p_arguments" | "p_transition"> & {
  p_operation: N; p_arguments: RpcArgs<N>; p_transition: TimerTransition | null
} }[TimerOperation];
// Preserve generated tables/returns; refine SQL-supported nullable and JSON inputs.
export type ServerDatabase = Omit<Database, "public"> & { public: Omit<Database["public"], "Functions"> & {
  Functions: { [N in RpcName]: Omit<Functions[N], "Args"> & { Args: ArgumentMap[N] } }
} };

/** Use the same JSON serialization as supabase-js, then validate the result. */
export function toJson(value: unknown): Json {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Database input is not JSON serializable");
  const parsed: unknown = JSON.parse(serialized);
  function isJson(input: unknown): input is Json {
    return input === null || typeof input === "string" || typeof input === "boolean" ||
      (typeof input === "number" && Number.isFinite(input)) ||
      (Array.isArray(input) && input.every(isJson)) ||
      (typeof input === "object" && input !== null && Object.values(input).every(isJson));
  }
  if (!isJson(parsed)) throw new Error("Database input is not JSON serializable");
  return parsed;
}

export function toRequiredJson(value: unknown): NonNullable<Json> {
  const json = toJson(value);
  if (json === null) throw new Error("Database input must not be null");
  return json;
}
