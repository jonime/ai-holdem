-- Run against migrated local Supabase with psql -v ON_ERROR_STOP=1.
-- Everything rolls back; no existing games are changed.
begin;
create temporary table snapshot_fixture (game_id uuid);
insert into snapshot_fixture values (gen_random_uuid());
grant select on snapshot_fixture to service_role;
insert into public.games (id, current_state, hand_number)
  select game_id, '{"fixture":true}', 2 from snapshot_fixture;
insert into public.game_players (game_id, seat, name, controller, stack, status, engine_player_id)
  select game_id, seat, 'Fixture', 'human', 1000, 'claimed', 'player-' || seat
  from snapshot_fixture cross join generate_series(0, 1) seat order by seat desc;
insert into public.game_hosts select game_id, 'fixture-host' from snapshot_fixture;
insert into public.game_listings (game_id, is_public, title)
  select game_id, true, 'Fixture' from snapshot_fixture;
insert into public.hands (game_id, hand_number, status, initial_state)
  select game_id, n, 'playing', '{}' from snapshot_fixture cross join generate_series(1, 2) n;
insert into public.hand_card_reveals (game_id, hand_id, player_id, hand_number, engine_player_id, reason)
  select h.game_id, h.id, p.id, h.hand_number,
    case when h.hand_number = 1 then 'old-player' else p.engine_player_id end, 'voluntary'
  from public.hands h join snapshot_fixture f on f.game_id = h.game_id
  join public.game_players p on p.game_id = h.game_id and p.seat = 0;

do $$ declare proc record; begin
  select * into proc from pg_proc where oid = 'public.get_game_read_snapshot(uuid)'::regprocedure;
  assert proc.provolatile = 's', 'Must be STABLE';
  assert not proc.prosecdef, 'Must be SECURITY INVOKER';
  assert 'search_path=public' = any(proc.proconfig), 'Must fix search path';
  assert not has_function_privilege('anon', proc.oid, 'EXECUTE');
  assert not has_function_privilege('authenticated', proc.oid, 'EXECUTE');
  assert has_function_privilege('service_role', proc.oid, 'EXECUTE');
end $$;
set local role anon;
do $$ begin
  perform public.get_game_read_snapshot(gen_random_uuid());
  raise exception 'Anonymous execution should be denied';
exception when insufficient_privilege then null;
end $$;
reset role;
set local role authenticated;
do $$ begin
  perform public.get_game_read_snapshot(gen_random_uuid());
  raise exception 'Authenticated execution should be denied';
exception when insufficient_privilege then null;
end $$;
reset role;
set local role service_role;
do $$ declare result jsonb; begin
  result := public.get_game_read_snapshot((select game_id from snapshot_fixture));
  assert result -> 'game' -> 'current_state' = '{"fixture":true}'::jsonb;
  assert (result -> 'assignments' -> 0 ->> 'seat')::integer = 0;
  assert (result -> 'assignments' -> 1 ->> 'seat')::integer = 1;
  assert result ->> 'host_token' = 'fixture-host';
  assert result -> 'listing' ->> 'title' = 'Fixture';
  assert result -> 'revealed_player_ids' = '["player-0"]'::jsonb, 'Must exclude older hands';
  assert public.get_game_read_snapshot(gen_random_uuid()) is null;
end $$;
reset role;
-- Same-hand reveals from a different game must also be excluded.
insert into public.games (current_state, hand_number) values ('{}', 2);
do $$ declare result jsonb; begin
  result := public.get_game_read_snapshot((select id from public.games where current_state = '{}' and hand_number = 2 order by created_at desc limit 1));
  assert result -> 'assignments' = '[]'::jsonb;
  assert result -> 'host_token' = 'null'::jsonb;
  assert result -> 'listing' = 'null'::jsonb;
  assert result -> 'revealed_player_ids' = '[]'::jsonb;
end $$;
rollback;
