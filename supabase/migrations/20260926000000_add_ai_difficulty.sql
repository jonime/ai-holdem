alter table public.game_players
  add column ai_difficulty text
    check (ai_difficulty in ('easy', 'medium', 'hard'));

update public.game_players
set ai_difficulty = 'medium'
where controller = 'typesafe_ai';

alter table public.game_players
  add constraint game_players_ai_difficulty_matches_controller
  check (
    (controller = 'typesafe_ai' and ai_difficulty is not null)
    or (controller = 'human' and ai_difficulty is null)
  );

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

revoke all on function public.create_game_session(jsonb, integer, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_game_session(jsonb, integer, integer, text, jsonb)
  to service_role;
