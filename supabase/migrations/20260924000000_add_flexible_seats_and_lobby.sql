alter table public.game_players
  alter column engine_player_id drop not null,
  add column leaving boolean not null default false;

drop index if exists game_players_game_id_engine_player_id_key;
create unique index game_players_game_id_engine_player_id_key
  on public.game_players (game_id, engine_player_id)
  where engine_player_id is not null;

alter table public.games
  add column min_seats_to_start integer not null default 2
    check (min_seats_to_start >= 2);

create or replace function public.create_game_session(
  p_current_state jsonb,
  p_state_schema_version integer,
  p_hand_number integer,
  p_status text,
  p_players jsonb
)
returns setof public.games
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_game public.games;
begin
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) < 2 then
    raise exception 'A game session requires at least two configured seats';
  end if;

  insert into public.games (
    current_state, state_schema_version, hand_number, status
  )
  values (
    p_current_state, p_state_schema_version, p_hand_number, p_status
  )
  returning * into created_game;

  insert into public.game_players (
    game_id, seat, name, controller, stack, engine_player_id,
    status, player_token, is_host, leaving
  )
  select
    created_game.id, players.seat, players.name, players.controller,
    players.stack, players.engine_player_id, coalesce(players.status, 'open'),
    players.player_token, coalesce(players.is_host, false),
    coalesce(players.leaving, false)
  from jsonb_to_recordset(p_players) as players(
    seat integer,
    name text,
    controller text,
    stack integer,
    engine_player_id text,
    status text,
    player_token text,
    is_host boolean,
    leaving boolean
  );

  if p_status <> 'waiting' then
    insert into public.hands (game_id, hand_number, status, initial_state)
    values (created_game.id, p_hand_number, 'playing', p_current_state);
  end if;

  return next created_game;
end;
$$;

create or replace function public.start_game_if_version(
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
    set current_state = p_current_state,
        status = 'playing',
        hand_number = p_hand_number,
        state_schema_version = p_state_schema_version,
        version = version + 1
    where id = p_game_id
      and version = p_expected_version
      and status = 'waiting'
    returning *
  ), inserted_hand as (
    insert into public.hands (game_id, hand_number, status, initial_state)
    select id, p_hand_number, 'playing', p_current_state
    from updated_game
    returning game_id
  )
  select id, status, current_state, state_schema_version, hand_number,
         version, created_at, updated_at
  from updated_game;
end;
$$;

revoke all on function public.create_game_session(jsonb, integer, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_game_session(jsonb, integer, integer, text, jsonb)
  to service_role;
revoke all on function public.start_game_if_version(uuid, bigint, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.start_game_if_version(uuid, bigint, jsonb, integer, integer)
  to service_role;
