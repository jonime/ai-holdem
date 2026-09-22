create or replace function public.apply_human_action_if_version(
  p_game_id uuid,
  p_expected_version bigint,
  p_player_engine_id text,
  p_current_state jsonb,
  p_status text,
  p_hand_number integer,
  p_state_schema_version integer,
  p_street text,
  p_action text,
  p_amount integer,
  p_state_before jsonb,
  p_state_after jsonb,
  p_hand_complete boolean
)
returns setof public.games
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with eligible_action as (
    select
      game_players.id as player_id,
      hands.id as hand_id
    from public.game_players
    join public.hands
      on hands.game_id = game_players.game_id
      and hands.hand_number = p_hand_number
      and hands.status = 'playing'
    where game_players.game_id = p_game_id
      and game_players.engine_player_id = p_player_engine_id
      and game_players.controller = 'human'
  ), updated_game as (
    update public.games
    set
      current_state = p_current_state,
      status = p_status,
      hand_number = p_hand_number,
      state_schema_version = p_state_schema_version,
      version = version + 1
    from eligible_action
    where games.id = p_game_id
      and games.version = p_expected_version
    returning games.*, eligible_action.player_id, eligible_action.hand_id
  ), inserted_action as (
    insert into public.actions (
      game_id,
      hand_id,
      player_id,
      sequence,
      street,
      action,
      amount,
      state_before,
      state_after
    )
    select
      id as game_id,
      hand_id,
      player_id,
      (select coalesce(max(sequence), 0) + 1 from public.actions where hand_id = updated_game.hand_id),
      p_street,
      p_action,
      p_amount,
      p_state_before,
      p_state_after
    from updated_game
    returning hand_id
  ), completed_hand as (
    update public.hands
    set
      status = 'complete',
      final_state = p_state_after,
      completed_at = now()
    where p_hand_complete
      and id in (select hand_id from inserted_action)
  )
  select
    id,
    status,
    current_state,
    state_schema_version,
    hand_number,
    version,
    created_at,
    updated_at
  from updated_game;
end;
$$;