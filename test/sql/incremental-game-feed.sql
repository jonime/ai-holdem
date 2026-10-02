-- Run with psql -v ON_ERROR_STOP=1 against a migrated local database.
-- Fixtures and role changes are transaction-scoped; existing games are untouched.
begin;
do $$
declare
  fixture_game_id uuid := gen_random_uuid();
  fixture_player_id uuid := gen_random_uuid();
  result jsonb;
begin
  insert into public.games (id, current_state, hand_number)
    values (fixture_game_id, '{"current":true}', 60);
  insert into public.game_players (id, game_id, seat, name, controller, stack)
    values (fixture_player_id, fixture_game_id, 0, 'Fixture', 'human', 1000);
  insert into public.hands (game_id, hand_number, status, initial_state, final_state, completed_at)
    select fixture_game_id, n, case when n = 60 then 'playing' else 'complete' end,
      '{}', '{"final":true}', case when n = 60 then null else now() end
    from generate_series(1, 60) as n;
  insert into public.actions (game_id, hand_id, player_id, sequence, street, action, state_before, state_after)
    select fixture_game_id, h.id, fixture_player_id, 1, 'preflop', 'check', '{}', '{}'
    from public.hands h where h.game_id = fixture_game_id;

  result := public.get_game_feed_since(fixture_game_id, 0);
  assert jsonb_array_length(result) = 50, 'Expected 50-hand bound';
  assert (result -> 0 ->> 'handNumber')::integer = 11, 'Expected oldest retained hand 11';
  assert (result -> 49 ->> 'handNumber')::integer = 60, 'Expected chronological ordering';
  assert jsonb_array_length(public.get_game_feed_since(fixture_game_id, 0, 500)) = 50, 'Cannot exceed 50 hands';
  result := public.get_game_feed_since(fixture_game_id, 59);
  assert jsonb_array_length(result) = 2, 'Expected inclusive filter';
  assert (result -> 0 ->> 'handNumber')::integer = 59;
  assert result -> 0 -> 'latestState' = '{"final":true}'::jsonb;
  assert result -> 1 -> 'latestState' = '{"current":true}'::jsonb;
  assert result -> 0 -> 'actions' -> 0 ->> 'action' = 'check';
  assert (result -> 0 -> 'actions' -> 0 ->> 'seat')::integer = 0;
  assert public.get_game_feed_since(fixture_game_id, 61) = '[]'::jsonb;
  assert public.get_game_feed_since(fixture_game_id, 59, 0) = '[]'::jsonb;
  assert jsonb_array_length(public.get_game_feed(fixture_game_id)) = 50, 'Full feed remains available';
  assert not has_function_privilege('anon', 'public.get_game_feed_since(uuid,integer,integer)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.get_game_feed_since(uuid,integer,integer)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.get_game_feed_since(uuid,integer,integer)', 'EXECUTE');
end;
$$;
set local role anon;
do $$ begin
  perform public.get_game_feed_since(gen_random_uuid(), 0);
  raise exception 'Anonymous execution should be denied';
exception when insufficient_privilege then null;
end $$;
reset role;
set local role authenticated;
do $$ begin
  perform public.get_game_feed_since(gen_random_uuid(), 0);
  raise exception 'Authenticated execution should be denied';
exception when insufficient_privilege then null;
end $$;
reset role;
set local role service_role;
select public.get_game_feed_since(gen_random_uuid(), 0) = '[]'::jsonb as service_role_can_read;
reset role;
rollback;
