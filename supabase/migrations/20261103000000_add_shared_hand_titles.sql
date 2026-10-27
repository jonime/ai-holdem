-- Title metadata is mutable; frozen replay snapshots remain unchanged.
alter table public.replay_shares
  add column title text check (title is null or (length(title) between 1 and 80 and title !~ '[[:cntrl:]]' and title = btrim(title))),
  add column title_revision integer not null default 0 check (title_revision >= 0),
  add column title_attempted boolean not null default true;
-- Existing shares are ineligible. Insertion atomically consumes the sole attempt.
create or replace function public.manage_replay_share(p_game_id uuid, p_hand_number integer, p_creator_token text,
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
  if found then return jsonb_build_object('generationEligible',false,'share',jsonb_build_object('token',s.link_token,'expiresAt',s.expires_at,'title',s.title,'titleRevision',s.title_revision)); end if;
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
  return jsonb_build_object('generationEligible',true,'share',jsonb_build_object('token',s.link_token,'expiresAt',s.expires_at,'title',s.title,'titleRevision',s.title_revision));
end;
$$;
create or replace function public.list_replay_shares(p_creator_token text,
  p_before_created_at timestamptz default null, p_before_token text default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with candidates as materialized (
    select s.link_token, h.hand_number, s.created_at, s.expires_at, s.title, s.title_revision
    from public.replay_shares s join public.hands h on h.id=s.hand_id
    where s.creator_token=p_creator_token and p_creator_token <> ''
      and s.revoked_at is null and s.expires_at > statement_timestamp()
      and ((p_before_created_at is null and p_before_token is null)
        or (s.created_at,s.link_token) < (p_before_created_at,p_before_token))
    order by s.created_at desc,s.link_token desc limit 21
  ), page as (
    select * from candidates order by created_at desc,link_token desc limit 20
  )
  select jsonb_build_object('shares', coalesce((select jsonb_agg(jsonb_build_object(
    'token',link_token,'handNumber',hand_number,'createdAt',created_at,'expiresAt',expires_at,'title',title,'titleRevision',title_revision)
    order by created_at desc,link_token desc) from page),'[]'::jsonb),
    'nextCursor',case when (select count(*) from candidates)>20 then
      (select jsonb_build_object('beforeCreatedAt',created_at,'beforeToken',link_token)
       from page order by created_at,link_token limit 1) else null end);
$$;


create or replace function public.read_replay_share(p_link_token text)
returns jsonb language sql volatile security invoker set search_path=public as $$
 select snapshot || jsonb_build_object('title',title) from public.replay_shares
 where link_token=p_link_token and revoked_at is null and expires_at>clock_timestamp();
$$;
create function public.edit_replay_share_title(p_link_token text,p_creator_token text,p_revision integer,p_title text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare s public.replay_shares;
begin
 select * into s from public.replay_shares where link_token=p_link_token
 and creator_token=p_creator_token and p_creator_token<>'' for update;
 if not found or s.revoked_at is not null or s.expires_at<=clock_timestamp() then
 return jsonb_build_object('outcome','forbidden'); end if;
 if s.title_revision<>p_revision then return jsonb_build_object('outcome','conflict'); end if;
 update public.replay_shares set title=p_title,title_revision=title_revision+1 where link_token=p_link_token returning * into s;
 return jsonb_build_object('token',s.link_token,'expiresAt',s.expires_at,'title',s.title,'titleRevision',s.title_revision);
end; $$;
create function public.commit_replay_share_title(p_link_token text,p_title text)
returns boolean language sql security invoker set search_path=public as $$
 with updated as (update public.replay_shares set title=p_title,title_revision=title_revision+1
 where link_token=p_link_token and revoked_at is null and expires_at>clock_timestamp()
 and title_revision=0 and title_attempted and title is null returning 1)
 select exists(select 1 from updated);
$$;
revoke all on function public.edit_replay_share_title(text,text,integer,text) from public,anon,authenticated;
revoke all on function public.commit_replay_share_title(text,text) from public,anon,authenticated;
grant execute on function public.edit_replay_share_title(text,text,integer,text) to service_role;
grant execute on function public.commit_replay_share_title(text,text) to service_role;
