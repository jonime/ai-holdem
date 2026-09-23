create table public.game_hosts (
  game_id uuid primary key references public.games(id) on delete cascade,
  host_token text not null
);

revoke all on table public.game_hosts from public, anon, authenticated;
grant select, insert on table public.game_hosts to service_role;

insert into public.game_hosts (game_id, host_token)
select distinct on (game_id) game_id, player_token
from public.game_players
where is_host and player_token is not null
order by game_id, seat;

drop function public.create_game_session(jsonb, integer, integer, text, jsonb);

create function public.create_game_session(
  p_current_state jsonb,
  p_state_schema_version integer,
  p_hand_number integer,
  p_status text,
  p_host_token text,
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
  if p_host_token is null or p_host_token = '' then
    raise exception 'A game session requires a host token';
  end if;

  insert into public.games (
    current_state, state_schema_version, hand_number, status
  )
  values (
    p_current_state, p_state_schema_version, p_hand_number, p_status
  )
  returning * into created_game;

  insert into public.game_hosts (game_id, host_token)
  values (created_game.id, p_host_token);

  insert into public.game_players (
    game_id, seat, name, controller, ai_difficulty, stack, engine_player_id,
    status, player_token, is_host, leaving
  )
  select
    created_game.id, players.seat, players.name, players.controller,
    players.ai_difficulty, players.stack, players.engine_player_id,
    coalesce(players.status, 'open'), players.player_token,
    coalesce(players.is_host, false), coalesce(players.leaving, false)
  from jsonb_to_recordset(p_players) as players(
    seat integer,
    name text,
    controller text,
    ai_difficulty text,
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

revoke all on function public.create_game_session(
  jsonb, integer, integer, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_game_session(
  jsonb, integer, integer, text, text, jsonb
) to service_role;