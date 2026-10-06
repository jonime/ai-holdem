-- Apply before deploying Play. No snapshots or private gameplay data leave this RPC.
create index game_hosts_token_game_idx on public.game_hosts (host_token, game_id);
create index game_players_claimed_human_token_game_idx
  on public.game_players (player_token, game_id)
  where status = 'claimed' and controller = 'human';

create function public.list_my_games(p_player_token text)
returns table (game_id uuid, title text, status text, updated_at timestamptz,
  occupied_seats bigint, total_seats bigint)
language sql security invoker set search_path = public as $$
  with owned as (
    select game_id from public.game_hosts
      where host_token = nullif(p_player_token, '')
    union
    select game_id from public.game_players
      where player_token = nullif(p_player_token, '')
        and status = 'claimed' and controller = 'human'
  ), recent as (
    select g.id, g.status, g.updated_at from public.games g
    join owned o on o.game_id = g.id
    order by g.updated_at desc, g.id desc limit 5
  )
  select g.id, case when l.is_public then l.title else null end,
    g.status::text, g.updated_at,
    count(p.id) filter (where p.status <> 'open'), count(p.id)
  from recent g
  left join public.game_listings l on l.game_id = g.id
  left join public.game_players p on p.game_id = g.id
  group by g.id, g.status, g.updated_at, l.is_public, l.title
  order by g.updated_at desc, g.id desc;
$$;
revoke all on function public.list_my_games(text) from public, anon, authenticated;
grant execute on function public.list_my_games(text) to service_role;
