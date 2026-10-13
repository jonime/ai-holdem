-- Additive: deploy before enhanced application instances. Retain legacy writers.
create table public.creation_attempts (
  owner_hash text not null check (owner_hash ~ '^[a-f0-9]{64}$'),
  attempt_id uuid not null,
  intent_fingerprint text not null check (intent_fingerprint ~ '^[a-f0-9]{64}$'),
  game_id uuid references public.games(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (owner_hash, attempt_id)
);
alter table public.creation_attempts enable row level security;
revoke all on public.creation_attempts from public, anon, authenticated;
grant all on public.creation_attempts to service_role;

create function public.create_game_with_attempt(
  p_owner text, p_attempt_id uuid, p_fingerprint text,
  p_owner_hash text, p_ip_hash text, p_owner_allowance integer, p_ip_allowance integer, p_window_ms integer,
  p_arguments jsonb, p_transition jsonb default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare previous public.creation_attempts; admission jsonb; result jsonb; created_id uuid;
begin
  if p_owner is null or p_owner !~ '^[a-f0-9]{64}$' or p_attempt_id is null
    or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid creation attempt';
  end if;
  -- Transaction lock works even before a record exists. Hash collisions only serialize.
  perform pg_advisory_xact_lock(hashtextextended(p_owner || ':' || p_attempt_id::text, 0));
  select * into previous from public.creation_attempts where owner_hash=p_owner and attempt_id=p_attempt_id;
  if found then
    if previous.intent_fingerprint <> p_fingerprint then
      return jsonb_build_object('outcome','conflict');
    end if;
    -- The FK null retains a permanent tombstone. Lock against concurrent deletion.
    select jsonb_build_array(to_jsonb(g)) into result from public.games g where id=previous.game_id for key share;
    if result is null then return jsonb_build_object('outcome','unavailable'); end if;
    return jsonb_build_object('outcome','created','games',result);
  end if;
  admission := public.admit_game_creation(p_owner_hash,p_ip_hash,p_owner_allowance,p_ip_allowance,p_window_ms);
  if admission->>'outcome' <> 'admitted' then return admission; end if;
  -- Reuse established seat, hand, host and timer persistence in the same transaction.
  result := public.commit_with_turn_timer('create_game_session',p_arguments,p_transition);
  created_id := (result->0->>'id')::uuid;
  if created_id is null then raise exception 'Creation failed'; end if;
  insert into public.creation_attempts(owner_hash,attempt_id,intent_fingerprint,game_id)
    values(p_owner,p_attempt_id,p_fingerprint,created_id);
  return jsonb_build_object('outcome','created','games',result);
end; $$;
revoke all on function public.create_game_with_attempt(text,uuid,text,text,text,integer,integer,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_game_with_attempt(text,uuid,text,text,text,integer,integer,integer,jsonb,jsonb) to service_role;
