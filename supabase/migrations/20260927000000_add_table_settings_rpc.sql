create or replace function public.update_table_settings_if_version(
  p_game_id uuid,
  p_expected_version bigint,
  p_seat_count integer,
  p_small_blind integer,
  p_big_blind integer,
  p_starting_stack integer,
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
  if p_small_blind < 1 then
    raise exception 'smallBlind must be a positive integer';
  end if;
  if p_big_blind <= p_small_blind then
    raise exception 'bigBlind must be greater than smallBlind';
  end if;
  if p_starting_stack < p_big_blind then
    raise exception 'startingStack must be at least as large as bigBlind';
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
  select p_game_id, seat_number, 'Seat ' || (seat_number + 1), 'human',
         p_starting_stack, 'open'
  from generate_series(0, p_seat_count - 1) as seat_number
  where not exists (
    select 1 from public.game_players
    where game_players.game_id = p_game_id and game_players.seat = seat_number
  );

  update public.game_players
  set stack = p_starting_stack
  where game_id = p_game_id;

  return query
  update public.games
  set current_state = p_current_state,
      state_schema_version = p_state_schema_version,
      version = version + 1
  where id = p_game_id
  returning id, status, current_state, state_schema_version, hand_number,
            version, created_at, updated_at, min_seats_to_start;
end;
$$;

revoke all on function public.update_table_settings_if_version(
  uuid, bigint, integer, integer, integer, integer, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.update_table_settings_if_version(
  uuid, bigint, integer, integer, integer, integer, jsonb, integer
) to service_role;