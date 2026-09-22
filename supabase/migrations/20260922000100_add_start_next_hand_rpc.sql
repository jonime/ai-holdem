create or replace function public.start_next_hand_if_version(
  p_game_id uuid,
  p_expected_version bigint,
  p_current_state jsonb,
  p_hand_number integer,
  p_state_schema_version integer
)
returns setof public.games
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with updated_game as (
    update public.games
    set
      current_state = p_current_state,
      status = 'playing',
      hand_number = p_hand_number,
      state_schema_version = p_state_schema_version,
      version = version + 1
    where id = p_game_id
      and version = p_expected_version
      and status = 'complete'
    returning *
  ), inserted_hand as (
    insert into public.hands (
      game_id,
      hand_number,
      status,
      initial_state
    )
    select
      id,
      p_hand_number,
      'playing',
      p_current_state
    from updated_game
    returning game_id
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

revoke all on function public.start_next_hand_if_version(
  uuid,
  bigint,
  jsonb,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.start_next_hand_if_version(
  uuid,
  bigint,
  jsonb,
  integer,
  integer
) to service_role;