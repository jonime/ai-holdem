alter table public.game_players
  add column status text not null default 'open'
    check (status in ('open', 'claimed', 'bot')),
  add column player_token text,
  add column is_host boolean not null default false;

create index game_players_token_idx
  on public.game_players (game_id, player_token)
  where player_token is not null;

alter table public.game_players
  alter column status set default 'claimed';

alter table public.game_players
  alter column controller set default 'human';

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
    raise exception 'A game session requires at least two players';
  end if;

  insert into public.games (
    current_state,
    state_schema_version,
    hand_number,
    status
  )
  values (
    p_current_state,
    p_state_schema_version,
    p_hand_number,
    p_status
  )
  returning * into created_game;

  insert into public.game_players (
    game_id,
    seat,
    name,
    controller,
    stack,
    engine_player_id,
    status,
    player_token,
    is_host
  )
  select
    created_game.id,
    players.seat,
    players.name,
    players.controller,
    players.stack,
    players.engine_player_id,
    coalesce(players.status, 'claimed'),
    players.player_token,
    coalesce(players.is_host, false)
  from jsonb_to_recordset(p_players) as players(
    seat integer,
    name text,
    controller text,
    stack integer,
    engine_player_id text,
    status text,
    player_token text,
    is_host boolean
  );

  insert into public.hands (
    game_id,
    hand_number,
    status,
    initial_state
  )
  values (
    created_game.id,
    p_hand_number,
    'playing',
    p_current_state
  );

  return next created_game;
end;
$$;

revoke all on function public.create_game_session(
  jsonb,
  integer,
  integer,
  text,
  jsonb
) from public;

revoke all on function public.create_game_session(
  jsonb,
  integer,
  integer,
  text,
  jsonb
) from anon, authenticated;

grant execute on function public.create_game_session(
  jsonb,
  integer,
  integer,
  text,
  jsonb
) to service_role;
