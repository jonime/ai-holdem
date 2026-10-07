-- Deploy before application code. Exclusions are private and do not revoke URL access.
create table public.personal_game_exclusions (
  game_id uuid not null references public.games(id) on delete cascade,
  player_token text not null check (length(player_token)>0),
  primary key (game_id,player_token)
);
alter table public.personal_game_exclusions enable row level security;
revoke all on public.personal_game_exclusions from public,anon,authenticated;
grant all on public.personal_game_exclusions to service_role;

-- Public directory joins also claim seats directly under the game lock.
create function public.restore_personal_game_on_claim() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if new.controller='human' and new.status='claimed' and not new.leaving
    and (old.status is distinct from new.status or old.player_token is distinct from new.player_token) then
    delete from public.personal_game_exclusions where game_id=new.game_id and player_token=new.player_token;
  end if;
  return new;
end; $$;
create trigger restore_personal_game_on_claim after update on public.game_players
for each row execute function public.restore_personal_game_on_claim();
revoke all on function public.restore_personal_game_on_claim() from public,anon,authenticated;

-- Restore only on successful claims, including idempotent retries.
alter function public.claim_game_seat_if_version(uuid,bigint,integer,text,text) rename to claim_game_seat_before_removal;
create function public.claim_game_seat_if_version(p_game_id uuid,p_expected_version bigint,p_seat integer,p_player_token text,p_name text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
  result := public.claim_game_seat_before_removal(p_game_id,p_expected_version,p_seat,p_player_token,p_name);
  if result->>'outcome'='ok' and result #>> '{seat,leaving}'='false' then
    delete from public.personal_game_exclusions where game_id=p_game_id and player_token=p_player_token;
  end if;
  return result;
end; $$;
revoke all on function public.claim_game_seat_if_version(uuid,bigint,integer,text,text) from public,anon,authenticated;
grant execute on function public.claim_game_seat_if_version(uuid,bigint,integer,text,text) to service_role;

drop function public.list_my_games(text);
create function public.list_my_games(p_player_token text)
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
        then 'deletion_blocked' else 'delete' end
      else 'leave_and_remove' end
  from recent g left join public.game_listings l on l.game_id=g.id
  left join public.game_players p on p.game_id=g.id
  group by g.id,g.status,g.updated_at,g.version,l.is_public,l.title
  order by g.updated_at desc,g.id desc;
$$;
revoke all on function public.list_my_games(text) from public,anon,authenticated;
grant execute on function public.list_my_games(text) to service_role;

create function public.remove_game_if_version(p_game_id uuid,p_expected_version bigint,p_player_token text,p_operation text,p_fold jsonb default null)
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
