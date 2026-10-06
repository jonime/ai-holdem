-- Deploy before application code. Only hashes/opaque game identifiers enter this store.
create table public.usage_allowances (
  key text primary key,
  attempts timestamptz[] not null default '{}' check (cardinality(attempts) <= 600),
  last_seen timestamptz not null
);
create index usage_allowances_cleanup on public.usage_allowances(last_seen);
alter table public.usage_allowances enable row level security;
revoke all on public.usage_allowances from public, anon, authenticated;
grant all on public.usage_allowances to service_role;
alter table public.bot_step_claims add column usage_admitted boolean not null default false;

-- Called only by service-role admissions. All keys lock in lexical order.
create function public.reserve_usage(p_keys text[], p_allowances integer[], p_windows_ms integer[], p_codes text[])
returns jsonb language plpgsql security invoker set search_path = public as $$
declare i integer; k text; db_now timestamptz; history timestamptz[]; wait_ms bigint;
  longest bigint := 0; denial text;
begin
  if p_keys is null or p_allowances is null or p_windows_ms is null or p_codes is null
    or cardinality(p_keys) <> 2 or cardinality(p_allowances) <> 2 or cardinality(p_windows_ms) <> 2
    or cardinality(p_codes) <> 2 or p_keys[1] = p_keys[2]
    or exists(select 1 from unnest(p_keys) as keys(value) where keys.value is null or length(keys.value) > 100)
    or exists(select 1 from unnest(p_codes) c where c is null or c not in ('OWNER_AI_LIMIT','GAME_AI_RATE_LIMIT','GAME_CREATION_LIMIT'))
    or exists(select 1 from unnest(p_allowances) a where a is null or a < 1 or a > 600)
    or exists(select 1 from unnest(p_windows_ms) w where w is null or w < 1 or w > 3600000) then
    raise exception 'Invalid usage policy';
  end if;
  for k in select unnest(p_keys) order by 1 loop
    insert into public.usage_allowances(key,last_seen) values(k,clock_timestamp()) on conflict do nothing;
    perform 1 from public.usage_allowances where key=k for update;
  end loop;
  -- Indexed, bounded cleanup. Row locking prevents deleting active admissions.
  delete from public.usage_allowances where key in (
    select key from public.usage_allowances where last_seen < clock_timestamp()-interval '24 hours'
    order by last_seen limit 100 for update skip locked
  );
  db_now := clock_timestamp();
  for i in 1..2 loop
    select coalesce(array_agg(t order by t), '{}') into history
      from public.usage_allowances u, unnest(u.attempts) t
      where u.key=p_keys[i] and t > db_now - p_windows_ms[i]*interval '1 millisecond';
    update public.usage_allowances set attempts=history,last_seen=db_now where key=p_keys[i];
    if cardinality(history) >= p_allowances[i] then
      wait_ms := greatest(1,ceil(extract(epoch from (history[cardinality(history)-p_allowances[i]+1]
        + p_windows_ms[i]*interval '1 millisecond' - db_now))*1000));
      if wait_ms > longest then longest := wait_ms; denial := p_codes[i]; end if;
    end if;
  end loop;
  if longest > 0 then return jsonb_build_object('outcome','denied','code',denial,'retryAfterMs',longest); end if;
  for i in 1..2 loop
    update public.usage_allowances set attempts=array_append(attempts,db_now) where key=p_keys[i];
  end loop;
  return jsonb_build_object('outcome','admitted');
end;
$$;

create function public.admit_game_creation(p_owner_hash text, p_ip_hash text,
  p_owner_allowance integer, p_ip_allowance integer, p_window_ms integer)
returns jsonb language plpgsql security invoker set search_path = public as $$
begin
  if p_owner_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$'
    or p_owner_hash is null or p_ip_hash is null then raise exception 'Invalid usage identity'; end if;
  return public.reserve_usage(array['creation:owner:'||p_owner_hash,'creation:ip:'||p_ip_hash],
    array[p_owner_allowance,p_ip_allowance],array[p_window_ms,p_window_ms],
    array['GAME_CREATION_LIMIT','GAME_CREATION_LIMIT']);
end;
$$;

create function public.admit_external_bot_call(p_game_id uuid, p_expected_version bigint,
  p_claim_token uuid, p_owner_hash text, p_owner_allowance integer, p_owner_window_ms integer,
  p_game_allowance integer, p_game_window_ms integer)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare g public.games; c public.bot_step_claims; result jsonb;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found or p_expected_version is null or g.version <> p_expected_version then return jsonb_build_object('outcome','conflict'); end if;
  select * into c from public.bot_step_claims where game_id=p_game_id;
  if not found or p_claim_token is null or c.expected_version <> p_expected_version or c.claim_token <> p_claim_token
    or c.expires_at <= clock_timestamp() then return jsonb_build_object('outcome','claim_lost'); end if;
  if not exists(select 1 from public.game_hosts where game_id=p_game_id)
    or p_owner_hash is null or p_owner_hash !~ '^[a-f0-9]{64}$' then raise exception 'Missing usage owner'; end if;
  if c.usage_admitted then return jsonb_build_object('outcome','admitted'); end if;
  result := public.reserve_usage(array['inference:owner:'||p_owner_hash,'inference:game:'||p_game_id::text],
    array[p_owner_allowance,p_game_allowance],array[p_owner_window_ms,p_game_window_ms],
    array['OWNER_AI_LIMIT','GAME_AI_RATE_LIMIT']);
  -- Allowance lock contention may outlive a lease: roll back reservations in that case.
  if c.expires_at <= clock_timestamp() then raise exception 'BOT_STEP_CLAIM_LOST'; end if;
  if result->>'outcome'='admitted' then
    update public.bot_step_claims set usage_admitted=true where game_id=p_game_id and claim_token=p_claim_token;
  end if;
  return result;
end;
$$;
revoke all on function public.reserve_usage(text[],integer[],integer[],text[]) from public,anon,authenticated;
revoke all on function public.admit_game_creation(text,text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.admit_external_bot_call(uuid,bigint,uuid,text,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_usage(text[],integer[],integer[],text[]) to service_role;
grant execute on function public.admit_game_creation(text,text,integer,integer,integer) to service_role;
grant execute on function public.admit_external_bot_call(uuid,bigint,uuid,text,integer,integer,integer,integer) to service_role;
-- Claim takeover must reset the idempotency marker (old acquisition function predates it).
create or replace function public.acquire_bot_step_claim(p_game_id uuid, p_expected_version bigint,
  p_actor_engine_id text, p_claim_token uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare g public.games; c public.bot_step_claims; db_now timestamptz;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found or p_expected_version is null or g.version <> p_expected_version then return jsonb_build_object('outcome','conflict'); end if;
  if not exists(select 1 from public.game_players where game_id=p_game_id
    and engine_player_id=p_actor_engine_id and controller in ('bot','typesafe_ai')) then
    return jsonb_build_object('outcome','conflict'); end if;
  db_now := clock_timestamp();
  select * into c from public.bot_step_claims where game_id=p_game_id;
  if found and c.expected_version=p_expected_version and c.actor_engine_id=p_actor_engine_id and c.expires_at > db_now then
    return jsonb_build_object('outcome','busy','expiresAt',c.expires_at,
      'retryAfterMs',ceil(extract(epoch from (c.expires_at-db_now))*1000)); end if;
  insert into public.bot_step_claims(game_id,expected_version,actor_engine_id,claim_token,expires_at,usage_admitted)
    values(p_game_id,p_expected_version,p_actor_engine_id,p_claim_token,db_now+interval '90 seconds',false)
    on conflict(game_id) do update set expected_version=excluded.expected_version,actor_engine_id=excluded.actor_engine_id,
      claim_token=excluded.claim_token,expires_at=excluded.expires_at,usage_admitted=false;
  return jsonb_build_object('outcome','acquired');
end;
$$;
