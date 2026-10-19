-- Owner browsing never returns snapshots or source identifiers.
create index replay_shares_owner_order on public.replay_shares
  (creator_token, created_at desc, link_token desc) where revoked_at is null;

create function public.list_replay_shares(p_creator_token text,
  p_before_created_at timestamptz default null, p_before_token text default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with candidates as materialized (
    select s.link_token, h.hand_number, s.created_at, s.expires_at
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
    'token',link_token,'handNumber',hand_number,'createdAt',created_at,'expiresAt',expires_at)
    order by created_at desc,link_token desc) from page),'[]'::jsonb),
    'nextCursor',case when (select count(*) from candidates)>20 then
      (select jsonb_build_object('beforeCreatedAt',created_at,'beforeToken',link_token)
       from page order by created_at,link_token limit 1) else null end);
$$;

create function public.revoke_owned_replay_share(p_creator_token text, p_link_token text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare target public.replay_shares;
begin
  select * into target from public.replay_shares
    where link_token=p_link_token and creator_token=p_creator_token and p_creator_token <> '';
  if not found then return jsonb_build_object('revoked',true); end if;
  -- Same game -> hand -> share lock order as creation, legacy revocation and deletion.
  perform 1 from public.games where id=target.game_id for update;
  if not found then return jsonb_build_object('revoked',true); end if;
  perform 1 from public.hands where id=target.hand_id for update;
  update public.replay_shares set revoked_at=clock_timestamp()
    where link_token=p_link_token and creator_token=p_creator_token
      and revoked_at is null and expires_at > clock_timestamp();
  return jsonb_build_object('revoked',true);
end;
$$;
revoke all on function public.list_replay_shares(text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.revoke_owned_replay_share(text,text) from public,anon,authenticated;
grant execute on function public.list_replay_shares(text,timestamptz,text) to service_role;
grant execute on function public.revoke_owned_replay_share(text,text) to service_role;
