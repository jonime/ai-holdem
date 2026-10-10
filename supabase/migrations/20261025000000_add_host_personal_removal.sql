-- Deploy before application code. Host personal removal preserves other players and history.
-- Unseated removal only records a private exclusion; it does not change the game version.
create or replace function public.list_my_games(p_player_token text)
returns table(game_id uuid,title text,status text,updated_at timestamptz,occupied_seats bigint,total_seats bigint,version bigint,removal text)
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
      else 'leave_and_remove' end
  from recent g left join public.game_listings l on l.game_id=g.id
  left join public.game_players p on p.game_id=g.id
  group by g.id,g.status,g.updated_at,g.version,l.is_public,l.title
  order by g.updated_at desc,g.id desc;
$$;
revoke all on function public.list_my_games(text) from public,anon,authenticated;
grant execute on function public.list_my_games(text) to service_role;

create or replace function public.remove_game_if_version(p_game_id uuid,p_expected_version bigint,p_player_token text,p_operation text,p_fold jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare g public.games; target public.game_players; result jsonb;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found then return jsonb_build_object('outcome','missing'); end if;
  if nullif(p_player_token,'') is null then return jsonb_build_object('outcome','forbidden'); end if;
  if p_operation='delete' then
    if not exists(select 1 from public.game_hosts where game_id=p_game_id and host_token=p_player_token) then
      return jsonb_build_object('outcome','forbidden'); end if;
    if g.version is distinct from p_expected_version then return jsonb_build_object('outcome','conflict'); end if;
    if exists(select 1 from public.game_players where game_id=p_game_id and controller='human' and status='claimed' and player_token is distinct from p_player_token) then
      return jsonb_build_object('outcome','blocked'); end if;
    delete from public.hand_card_reveals where game_id=p_game_id;
    delete from public.actions where game_id=p_game_id;
    delete from public.hands where game_id=p_game_id;
    delete from public.games where id=p_game_id;
    -- usage_allowances has no game FK and is deliberately never refunded.
    return jsonb_build_object('outcome','ok','version',g.version);
  elsif p_operation='remove_from_list' then
    if not exists(select 1 from public.game_hosts where game_id=p_game_id and host_token=p_player_token) then
      return jsonb_build_object('outcome','forbidden'); end if;
    if g.version is distinct from p_expected_version then return jsonb_build_object('outcome','conflict'); end if;
    select * into target from public.game_players where game_id=p_game_id and controller='human' and status='claimed' and player_token=p_player_token for update;
    if found then
      result := public.depart_game_seat_if_version(p_game_id,p_expected_version,target.seat,p_player_token,p_fold);
      if result->>'outcome'<>'ok' then return result; end if;
    else
      if p_fold is not null then return jsonb_build_object('outcome','forbidden'); end if;
      result := jsonb_build_object('version',g.version);
    end if;
    insert into public.personal_game_exclusions values(p_game_id,p_player_token) on conflict do nothing;
    return jsonb_build_object('outcome','ok','version',(result->>'version')::bigint);
  elsif p_operation='leave_and_remove' then
    if exists(select 1 from public.game_hosts where game_id=p_game_id and host_token=p_player_token) then
      return jsonb_build_object('outcome','forbidden'); end if;
    select * into target from public.game_players where game_id=p_game_id and controller='human' and status='claimed' and player_token=p_player_token for update;
    if not found then return jsonb_build_object('outcome','forbidden'); end if;
    if g.version is distinct from p_expected_version then return jsonb_build_object('outcome','conflict'); end if;
    result := public.depart_game_seat_if_version(p_game_id,p_expected_version,target.seat,p_player_token,p_fold);
    if result->>'outcome'<>'ok' then return result; end if;
    insert into public.personal_game_exclusions values(p_game_id,p_player_token) on conflict do nothing;
    return jsonb_build_object('outcome','ok','version',(result->>'version')::bigint);
  end if;
  return jsonb_build_object('outcome','forbidden');
end; $$;
revoke all on function public.remove_game_if_version(uuid,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.remove_game_if_version(uuid,bigint,text,text,jsonb) to service_role;
