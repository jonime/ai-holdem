import type { GameDatabaseClient } from "./queries";
import type { CreationArgs, DeparturePayload, RpcArgs, TimerCommit } from "./contracts";
import type { UsageClient } from "@/lib/usage/admission";

// Compiled by npm run typecheck; never executed. Unused @ts-expect-error is a failure.
export function databaseContractRegression(client: GameDatabaseClient, usage: UsageClient,
  creation: CreationArgs, fold: DeparturePayload, humanAction: RpcArgs<"apply_human_action_if_version">) {
  client.rpc("get_game_read_snapshot", { p_game_id: "game" });
  client.rpc("get_game_feed", { p_game_id: "game" }); // SQL default
  client.rpc("claim_game_seat_if_version", { p_game_id: "game", p_expected_version: 1, p_player_token: "owner", p_seat: 0, p_name: null });
  client.rpc("commit_with_turn_timer", { p_operation: "create_game_session", p_arguments: creation, p_transition: null, p_driver_token: null });
  client.rpc("depart_game_seat_if_version", { p_game_id: "game", p_expected_version: 1, p_player_token: "owner", p_seat: 0, p_fold: fold });
  client.rpc("apply_human_action_if_version", { ...humanAction, p_amount: null, p_auto_reveal_reason: null });
  // @ts-expect-error unknown RPC
  client.rpc("invented_rpc", {});
  // @ts-expect-error missing parameter
  client.rpc("get_game_read_snapshot", {});
  // @ts-expect-error misspelled parameter
  client.rpc("get_game_read_snapshot", { p_gameID: "game" });
  // @ts-expect-error incorrect argument type
  client.rpc("get_game_read_snapshot", { p_game_id: 123 });
  // @ts-expect-error invalid table insert
  client.from("games").insert({ current_state: {}, status: "waiting", hand_number: "one" });
  // @ts-expect-error missing required insert fields
  client.from("game_hosts").insert({ game_id: "game" });
  // @ts-expect-error invalid update column
  client.from("games").update({ imaginary: true });
  // @ts-expect-error incorrect update type
  client.from("games").update({ version: "one" });
  // @ts-expect-error invalid filter column
  client.from("game_players").select().eq("imaginary", 1);
  // @ts-expect-error incorrect filter value type
  client.from("game_players").select().eq("seat", "one");
  client.from("game_players").update({ player_token: null }).eq("game_id", "game").eq("seat", 0);
  // @ts-expect-error operation/payload mismatch
  client.rpc("commit_with_turn_timer", { p_operation: "apply_human_action_if_version", p_arguments: creation, p_transition: null });
  // @ts-expect-error outside timer wrapper SQL allowlist
  const invalidTimer: TimerCommit = { p_operation: "get_game_read_snapshot", p_arguments: { p_game_id: "game" }, p_transition: null };
  // @ts-expect-error malformed creation players
  client.rpc("create_game_session", { ...creation, p_players: [{ seat: "one" }] });
  // @ts-expect-error malformed departure payload
  client.rpc("depart_game_seat_if_version", { p_game_id: "game", p_expected_version: 1, p_player_token: "owner", p_seat: 0, p_fold: { ...fold, action: "raise" } });
  // @ts-expect-error creation metadata cannot omit required admission arguments
  client.rpc("create_game_with_attempt", { p_attempt_id: "attempt", p_arguments: creation });
  // @ts-expect-error incorrect usage parameter
  usage.rpc("admit_game_creation", { p_owner_allowance: "unlimited" });
  // @ts-expect-error usage RPC name must exist
  usage.rpc("invented_admission", {});
  return invalidTimer;
}
