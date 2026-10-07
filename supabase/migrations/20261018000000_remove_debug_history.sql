-- Remove debug inspection storage while preserving actions, hands, claims and reveals.
-- Legacy inspection parameters remain ignored for rolling deployment compatibility.
create or replace function public.apply_ai_action_if_version(
  p_game_id uuid, p_expected_version bigint, p_player_engine_id text,
  p_current_state jsonb, p_status text, p_hand_number integer,
  p_state_schema_version integer, p_street text, p_action text, p_amount integer,
  p_state_before jsonb, p_state_after jsonb, p_hand_complete boolean,
  p_ai_state jsonb, p_legal_actions jsonb, p_choice text,
  p_bot_id text, p_bot_label text, p_bot_provider text, p_bot_model_id text,
  p_probabilities jsonb, p_confidence numeric, p_raise_size_choice text,
  p_raise_size_probabilities jsonb, p_raw_response jsonb,
  p_matched_rule text, p_prompt_version text, p_duration_ms integer,
  p_usage jsonb, p_cost numeric,
  p_auto_reveal_player_engine_id text default null,
  p_auto_reveal_reason text default null
)
returns setof public.games
language plpgsql security invoker set search_path = public
as $$
begin
  return query
  with eligible_action as (
    select game_players.id as player_id, hands.id as hand_id
    from public.game_players
    join public.hands on hands.game_id = game_players.game_id
      and hands.hand_number = p_hand_number and hands.status = 'playing'
    where game_players.game_id = p_game_id
      and game_players.engine_player_id = p_player_engine_id
      and game_players.controller = 'bot'
      and game_players.bot_id = p_bot_id
  ), updated_game as (
    update public.games
    set current_state = p_current_state, status = p_status,
      hand_number = p_hand_number, state_schema_version = p_state_schema_version,
      version = version + 1
    from eligible_action
    where games.id = p_game_id and games.version = p_expected_version
    returning games.*, eligible_action.player_id, eligible_action.hand_id
  ), inserted_action as (
    insert into public.actions (
      game_id, hand_id, player_id, sequence, street, action, amount,
      state_before, state_after
    )
    select id, hand_id, player_id,
      (select coalesce(max(sequence), 0) + 1 from public.actions
       where hand_id = updated_game.hand_id),
      p_street, p_action, p_amount, p_state_before, p_state_after
    from updated_game returning hand_id, player_id, sequence
  ), completed_hand as (
    update public.hands set status = 'complete', final_state = p_state_after,
      completed_at = now()
    where p_hand_complete and id in (select hand_id from inserted_action)
    returning id
  ), auto_reveal as (
    insert into public.hand_card_reveals (
      game_id, hand_id, player_id, hand_number, engine_player_id, reason
    )
    select p_game_id, completed_hand.id, winner.id, p_hand_number,
      p_auto_reveal_player_engine_id, p_auto_reveal_reason
    from completed_hand
    join public.games g on g.id = p_game_id and g.bots_show_uncontested_wins
    join public.game_players winner on winner.game_id = p_game_id
      and winner.engine_player_id = p_auto_reveal_player_engine_id
      and winner.controller = 'bot'
    where p_auto_reveal_player_engine_id is not null
      and p_auto_reveal_reason = 'bot_uncontested'
    on conflict (hand_id, player_id) do nothing returning id
  )
  select id, status, current_state, state_schema_version, hand_number,
    version, created_at, updated_at, min_seats_to_start, bots_show_uncontested_wins
  from updated_game;
end;
$$;

revoke all on function public.apply_ai_action_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, text, text, text, text, jsonb,
  numeric, text, jsonb, jsonb, text, text, integer, jsonb, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.apply_ai_action_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, text, text, text, text, jsonb,
  numeric, text, jsonb, jsonb, text, text, integer, jsonb, numeric, text, text
) to service_role;

drop function public.get_hand_history(uuid, integer);
drop table public.ai_decisions;
drop function public.set_ai_decision_bot_profile();
