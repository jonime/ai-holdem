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
    returning games.*
  ), inserted_hand as (
    insert into public.hands (game_id, hand_number, status, initial_state)
    select id, p_hand_number, 'playing', p_current_state
    from updated_game
    returning game_id
  )
  select updated_game.*
  from updated_game;
end;
$$;

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
    set current_state = p_current_state,
        status = 'playing',
        hand_number = p_hand_number,
        state_schema_version = p_state_schema_version,
        version = version + 1
    where id = p_game_id
      and version = p_expected_version
      and status = 'complete'
    returning games.*
  ), inserted_hand as (
    insert into public.hands (game_id, hand_number, status, initial_state)
    select id, p_hand_number, 'playing', p_current_state
    from updated_game
    returning game_id
  )
  select updated_game.*
  from updated_game;
end;
$$;

create or replace function public.update_seat_count_if_version(
  p_game_id uuid,
  p_expected_version bigint,
  p_seat_count integer,
  p_current_state jsonb,
  p_state_schema_version integer
)
returns setof public.games
language plpgsql
security invoker
set search_path = public
as $$
declare
  locked_game public.games;
  highest_occupied_seat integer;
begin
  if p_seat_count < 2 or p_seat_count > 6 then
    raise exception 'seatCount must be an integer from 2 through 6';
  end if;

  select * into locked_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    return;
  end if;

  if locked_game.status <> 'waiting' or locked_game.version <> p_expected_version then
    return;
  end if;

  select max(seat) into highest_occupied_seat
  from public.game_players
  where game_id = p_game_id and status <> 'open';

  if highest_occupied_seat is not null and highest_occupied_seat >= p_seat_count then
    raise exception 'Cannot shrink seat count below an occupied seat';
  end if;

  delete from public.game_players
  where game_id = p_game_id
    and seat >= p_seat_count
    and status = 'open';

  insert into public.game_players (game_id, seat, name, controller, stack, status)
  select p_game_id, seat_number, 'Seat ' || (seat_number + 1), 'human', 10000, 'open'
  from generate_series(0, p_seat_count - 1) as seat_number
  where not exists (
    select 1 from public.game_players
    where game_players.game_id = p_game_id and game_players.seat = seat_number
  );

  return query
  update public.games
  set current_state = p_current_state,
      state_schema_version = p_state_schema_version,
      version = version + 1
  where id = p_game_id
  returning games.*;
end;
$$;
