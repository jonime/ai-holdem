-- Sanitized immutable snapshots only; viewing tokens confer no management authority.
create table public.replay_shares (
  link_token text primary key check (link_token ~ '^[a-f0-9]{64}$'),
  game_id uuid not null references public.games(id) on delete cascade,
  hand_id uuid not null references public.hands(id) on delete cascade,
  creator_token text not null check (length(creator_token) > 0),
  snapshot jsonb not null check (snapshot->>'schemaVersion' = '1'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  revoked_at timestamptz
);
create unique index replay_shares_active_creator on public.replay_shares(hand_id, creator_token) where revoked_at is null;
alter table public.replay_shares enable row level security;
revoke all on public.replay_shares from public, anon, authenticated;
grant all on public.replay_shares to service_role;

create function public.manage_replay_share(p_game_id uuid, p_hand_number integer, p_creator_token text,
  p_operation text, p_link_token text, p_snapshot jsonb, p_history jsonb,
  p_owner_hash text, p_ip_hash text, p_owner_allowance integer, p_ip_allowance integer, p_window_ms integer)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare h public.hands; s public.replay_shares; admission jsonb; db_now timestamptz;
begin
  if p_operation is null or p_operation not in ('read','create','revoke') then raise exception 'Invalid operation'; end if;
  -- Serialize creators, revocation, source deletion, and version-checked Show mutations.
  perform 1 from public.games where id=p_game_id for update;
  if not found then return jsonb_build_object('outcome','forbidden'); end if;
  select * into h from public.hands where game_id=p_game_id and hand_number=p_hand_number for update;
  if not found or h.status <> 'complete' or p_creator_token is null or p_creator_token = ''
    or (select count(*) from jsonb_array_elements(h.initial_state->'config'->'players') p
      where p->>'controller'='human' and p->>'playerToken'=p_creator_token) <> 1 then
    return jsonb_build_object('outcome','forbidden');
  end if;
  if public.get_hand_replay(p_game_id,p_hand_number) is distinct from p_history then
    return jsonb_build_object('outcome','conflict');
  end if;
  db_now := clock_timestamp();
  if p_operation='revoke' then
    update public.replay_shares set revoked_at=db_now where hand_id=h.id and creator_token=p_creator_token and revoked_at is null;
    return jsonb_build_object('share',null);
  end if;
  select * into s from public.replay_shares where hand_id=h.id and creator_token=p_creator_token
    and revoked_at is null and expires_at > db_now;
  if found then return jsonb_build_object('share',jsonb_build_object('token',s.link_token,'expiresAt',s.expires_at)); end if;
  if p_operation='read' then return jsonb_build_object('share',null); end if;
  if p_link_token is null or p_link_token !~ '^[a-f0-9]{64}$'
    or p_owner_hash is null or p_owner_hash !~ '^[a-f0-9]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid share input'; end if;
  -- Separate share counters; reuse the existing bounded/locked admission primitive.
  admission := public.reserve_usage(array['share:owner:'||p_owner_hash,'share:ip:'||p_ip_hash],
    array[p_owner_allowance,p_ip_allowance],array[p_window_ms,p_window_ms],array['GAME_CREATION_LIMIT','GAME_CREATION_LIMIT']);
  if admission->>'outcome' <> 'admitted' then
    return jsonb_build_object('outcome','denied','retryAfterMs',admission->'retryAfterMs');
  end if;
  db_now := clock_timestamp();
  update public.replay_shares set revoked_at=db_now where hand_id=h.id and creator_token=p_creator_token and revoked_at is null;
  insert into public.replay_shares(link_token,game_id,hand_id,creator_token,snapshot,created_at,expires_at)
    values(p_link_token,p_game_id,h.id,p_creator_token,p_snapshot,db_now,db_now+interval '30 days') returning * into s;
  return jsonb_build_object('share',jsonb_build_object('token',s.link_token,'expiresAt',s.expires_at));
end;
$$;
create function public.read_replay_share(p_link_token text)
returns jsonb language sql volatile security invoker set search_path = public as $$
  select snapshot from public.replay_shares where link_token=p_link_token
    and revoked_at is null and expires_at > clock_timestamp();
$$;
revoke all on function public.manage_replay_share(uuid,integer,text,text,text,jsonb,jsonb,text,text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.read_replay_share(text) from public,anon,authenticated;
grant execute on function public.manage_replay_share(uuid,integer,text,text,text,jsonb,jsonb,text,text,integer,integer,integer) to service_role;
grant execute on function public.read_replay_share(text) to service_role;
