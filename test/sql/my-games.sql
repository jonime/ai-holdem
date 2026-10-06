begin;
-- Every fixture is private to this transaction and removed by rollback.
create temporary table mine_fixture (id uuid, n integer);
insert into mine_fixture select gen_random_uuid(), n from generate_series(1, 8) n;
insert into public.games(id, current_state, status, updated_at)
select id, '{}', case n when 1 then 'complete' when 2 then 'error' when 3 then 'playing' else 'waiting' end,
  '2026-01-01'::timestamptz + case when n < 4 then interval '10 days' else n * interval '1 day' end
from mine_fixture;
insert into public.game_players(game_id, seat, name, controller, stack, status, player_token)
select id, 0, 'Mine fixture', 'human', 1000, 'claimed', case when n in (1,3,4,5,6,7) then 'mine-sql-owner' else 'other-sql-owner' end from mine_fixture;
insert into public.game_players(game_id, seat, name, controller, stack, status)
select id, 1, 'Open fixture', 'human', 1000, 'open' from mine_fixture;
insert into public.game_hosts(game_id,host_token)
select id, 'mine-sql-owner' from mine_fixture where n in (2,3);
insert into public.game_listings(game_id,is_public,title)
select id, n=1, 'Listing fixture' from mine_fixture where n in (1,2);
set local role service_role;
do $$
begin
  if exists(select 1 from public.list_my_games(null)) or exists(select 1 from public.list_my_games('')) or exists(select 1 from public.list_my_games('unrelated-sql-visitor')) then raise exception 'Unrelated visitor received games'; end if;
  if (select count(*) from public.list_my_games('mine-sql-owner')) <> 5 then raise exception 'Five item limit'; end if;
  if (select count(distinct game_id) from public.list_my_games('mine-sql-owner')) <> 5 then raise exception 'Host and seat not deduplicated'; end if;
  if not exists(select 1 from public.list_my_games('mine-sql-owner') where status='complete' and title='Listing fixture') then raise exception 'Completed seated table missing'; end if;
  if not exists(select 1 from public.list_my_games('mine-sql-owner') where status='error' and title is null) then raise exception 'Unseated host or private title filtering failed'; end if;
  if exists(select 1 from public.list_my_games('mine-sql-owner') where occupied_seats<>1 or total_seats<>2) then raise exception 'Actual assignment counts'; end if;
end $$;
reset role;
do $$
declare actual uuid[]; expected uuid[];
begin
  select array_agg(game_id) into actual from public.list_my_games('mine-sql-owner');
  select array_agg(id) into expected from (select id from mine_fixture where n<>8 order by
    case when n<4 then 10 else n end desc, id desc limit 5) sorted;
  if actual is distinct from expected then raise exception 'Stable activity ordering'; end if;
end $$;
-- Released seat with a stale token is not ownership.
update public.game_players set status='open' where game_id=(select id from mine_fixture where n=1) and seat=0;
do $$ begin
  if exists(select 1 from public.list_my_games('mine-sql-owner') where game_id=(select id from mine_fixture where n=1)) then raise exception 'Released seat still visible'; end if;
  if has_function_privilege('anon','public.list_my_games(text)','execute') or has_function_privilege('authenticated','public.list_my_games(text)','execute') then raise exception 'RPC exposed'; end if;
  if not has_function_privilege('service_role','public.list_my_games(text)','execute') then raise exception 'Service role denied'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform * from public.list_my_games('mine-sql-owner'); raise exception 'Anon accessed RPC'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
do $$ begin
  begin perform * from public.list_my_games('mine-sql-owner'); raise exception 'Authenticated accessed RPC'; exception when insufficient_privilege then null; end;
end $$;
rollback;
