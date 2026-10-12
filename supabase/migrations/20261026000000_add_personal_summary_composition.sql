-- Deploy before application code. Assignment snapshots only; no presence or private seat data.
-- The return signature changes: apply this migration before deploying matching application code.
drop function public.list_my_games(text);
create or replace function public.list_my_games(p_player_token text)
returns table(game_id uuid,title text,status text,updated_at timestamptz,occupied_seats bigint,total_seats bigint,version bigint,removal text,human_count bigint,bot_count bigint,viewer_seated boolean)
language sql security invoker set search_path=public as $$
  with owned as (
    select game_id from public.game_hosts where host_token=nullif(p_player_token,'')
    union
    select game_id from public.game_players where player_token=nullif(p_player_token,'') and status='claimed' and controller='human'
  ), recent as (
    select g.* from public.games g join owned o on o.game_id=g.id
    where not exists(select 1 from public.personal_game_exclusions e where e.game_id=g.id and e.player_token=p_player_token)
    order by g.updated_at desc,g.id desc limit 5
  )
  select g.id,case when l.is_public then l.title else null end,g.status::text,g.updated_at,
    count(p.id) filter(where p.status<>'open'),count(p.id),g.version,
    case when exists(select 1 from public.game_hosts h where h.game_id=g.id and h.host_token=p_player_token)
      then case when exists(select 1 from public.game_players b where b.game_id=g.id and b.controller='human' and b.status='claimed' and b.player_token is distinct from p_player_token)
        then 'remove_from_list' else 'delete' end
      else 'leave_and_remove' end,
    count(p.id) filter(where p.controller='human' and p.status='claimed'),
    count(p.id) filter(where p.controller='bot' and p.status<>'open'),
    coalesce(bool_or(p.controller='human' and p.status='claimed' and p.player_token=p_player_token),false)
  from recent g left join public.game_listings l on l.game_id=g.id
  left join public.game_players p on p.game_id=g.id
  group by g.id,g.status,g.updated_at,g.version,l.is_public,l.title
  order by g.updated_at desc,g.id desc;
$$;
revoke all on function public.list_my_games(text) from public,anon,authenticated;
grant execute on function public.list_my_games(text) to service_role;

