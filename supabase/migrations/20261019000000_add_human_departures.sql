-- Deploy before application code. Game-row locks serialize all departure/action races.
-- Cleanup is part of the completing action transaction and never rewrites engine participants.
create function public.clear_completed_human_departures() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if new.status='complete' then
    update public.game_players set status='open', name='Seat '||(seat+1),
      player_token=null, is_host=false, leaving=false, engine_player_id=null,
      bot_id=null, bot_label=null, bot_provider=null, bot_model_id=null,
      ai_difficulty=null, bot_profile_id=null
    where game_id=new.id and controller='human' and status='claimed' and leaving;
  end if;
  return new;
end; $$;
create trigger completed_human_departures after update of current_state,status on public.games
for each row execute function public.clear_completed_human_departures();

create function public.guard_human_departure() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if old.controller='human' and old.leaving and not new.leaving
    and exists(select 1 from public.games where id=old.game_id and status='playing') then
    raise exception 'Departure cannot be cancelled during a hand';
  end if;
  return new;
end; $$;
create trigger irreversible_human_departure before update on public.game_players
for each row execute function public.guard_human_departure();

-- Keep the rolling-deployment action signature, but fence non-fold actions against
-- current seat state while holding the same game lock as departure registration.
alter function public.apply_human_action_if_version(uuid,bigint,text,jsonb,text,integer,integer,text,text,integer,jsonb,jsonb,boolean,text,text)
rename to apply_human_action_before_departures;
create function public.apply_human_action_if_version(
  p_game_id uuid, p_expected_version bigint, p_player_engine_id text,
  p_current_state jsonb, p_status text, p_hand_number integer,
  p_state_schema_version integer, p_street text, p_action text, p_amount integer,
  p_state_before jsonb, p_state_after jsonb, p_hand_complete boolean,
  p_auto_reveal_player_engine_id text default null, p_auto_reveal_reason text default null
) returns setof public.games language plpgsql security invoker set search_path=public as $$
begin
  perform 1 from public.games where id=p_game_id and version=p_expected_version for update;
  if not found then return; end if;
  if not exists(select 1 from public.game_players where game_id=p_game_id
    and engine_player_id=p_player_engine_id and controller='human' and status='claimed'
    and (not leaving or (p_action='fold' and p_amount is null))) then return; end if;
  return query select * from public.apply_human_action_before_departures(
    p_game_id,p_expected_version,p_player_engine_id,p_current_state,p_status,p_hand_number,
    p_state_schema_version,p_street,p_action,p_amount,p_state_before,p_state_after,p_hand_complete,
    p_auto_reveal_player_engine_id,p_auto_reveal_reason);
end; $$;

-- Private helper accepts only server-prepared, engine-validated folds.
create function public.commit_departure_fold(p_game_id uuid,p_expected_version bigint,p_fold jsonb)
returns setof public.games language plpgsql security invoker set search_path=public as $$
declare g public.games; actor text;
begin
  select * into g from public.games where id=p_game_id and version=p_expected_version for update;
  if not found or g.status <> 'playing' then return; end if;
  select player->>'playerId' into actor
    from jsonb_array_elements(g.current_state #> '{engineState,hand,players}') player
    where player->>'seat'=g.current_state #>> '{engineState,hand,currentActorSeat}';
  if actor is null or actor is distinct from p_fold->>'playerEngineId'
    or p_fold->>'action' is distinct from 'fold' or p_fold->'amount' <> 'null'::jsonb
    or (p_fold->>'handNumber')::integer is distinct from g.hand_number
    or p_fold->'stateBefore' is distinct from g.current_state
    or not exists(select 1 from public.game_players where game_id=p_game_id
      and engine_player_id=actor and controller='human' and status='claimed' and leaving) then
    raise exception 'Invalid departure fold';
  end if;
  return query select * from public.apply_human_action_if_version(
    p_game_id,p_expected_version,actor,p_fold->'currentState',p_fold->>'status',g.hand_number,
    (p_fold->>'stateSchemaVersion')::integer,p_fold->>'street','fold',null,
    g.current_state,p_fold->'currentState',(p_fold->>'handComplete')::boolean,
    p_fold->>'autoRevealPlayerEngineId',p_fold->>'autoRevealReason');
end; $$;

create function public.depart_game_seat_if_version(
  p_game_id uuid,p_expected_version bigint,p_seat integer,p_player_token text,p_fold jsonb default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare g public.games; target public.game_players; committed public.games;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found then return jsonb_build_object('outcome','missing'); end if;
  if g.version <> p_expected_version then return jsonb_build_object('outcome','conflict'); end if;
  select * into target from public.game_players where game_id=p_game_id and seat=p_seat for update;
  if not found then return jsonb_build_object('outcome','missing'); end if;
  if p_player_token is null or (target.player_token is distinct from p_player_token
    and not exists(select 1 from public.game_hosts where game_id=p_game_id and host_token=p_player_token)) then
    return jsonb_build_object('outcome','forbidden');
  end if;
  if target.leaving and g.status <> 'waiting' and not (g.status='complete' and target.controller='human') then
    return jsonb_build_object('outcome','ok','seat',to_jsonb(target),'version',g.version);
  end if;
  if g.status='waiting' or (g.status='complete' and target.controller='human') then
    update public.game_players set status='open',name='Seat '||(seat+1),controller='human',
      player_token=null,is_host=false,leaving=false,engine_player_id=null,
      bot_id=null,bot_label=null,bot_provider=null,bot_model_id=null,ai_difficulty=null,bot_profile_id=null
      where id=target.id returning * into target;
  else
    update public.game_players set is_host=false,leaving=true where id=target.id returning * into target;
  end if;
  if p_fold is not null then
    if target.controller <> 'human' or target.engine_player_id is distinct from p_fold->>'playerEngineId' then
      raise exception 'Invalid departure identity';
    end if;
    select * into committed from public.commit_departure_fold(p_game_id,p_expected_version,p_fold);
    if not found then raise exception 'Departure fold did not commit'; end if;
    g := committed;
    select * into target from public.game_players where id=target.id;
  else
    update public.games set version=version+1 where id=p_game_id returning * into g;
  end if;
  return jsonb_build_object('outcome','ok','seat',to_jsonb(target),'version',g.version);
end; $$;

-- Old instances can safely register departures without an action. Eligible browsers
-- then fold the departing actor using the new advancement endpoint.
create or replace function public.release_game_seat_if_version(p_game_id uuid,p_expected_version bigint,p_seat integer,p_player_token text)
returns jsonb language sql security invoker set search_path=public as $$
  select public.depart_game_seat_if_version($1,$2,$3,$4,null);
$$;

create function public.advance_departure_if_version(
  p_game_id uuid,p_expected_version bigint,p_driver_token text,p_fold jsonb
) returns setof public.games language plpgsql security invoker set search_path=public as $$
begin
  perform 1 from public.games where id=p_game_id and version=p_expected_version for update;
  if not found then return; end if;
  if p_driver_token is null or not (
    exists(select 1 from public.game_hosts where game_id=p_game_id and host_token=p_driver_token)
    or exists(select 1 from public.game_players where game_id=p_game_id and controller='human'
      and status='claimed' and player_token=p_driver_token)) then return; end if;
  return query select * from public.commit_departure_fold(p_game_id,p_expected_version,p_fold);
end; $$;

revoke all on function public.apply_human_action_if_version(uuid,bigint,text,jsonb,text,integer,integer,text,text,integer,jsonb,jsonb,boolean,text,text) from public,anon,authenticated;
grant execute on function public.apply_human_action_if_version(uuid,bigint,text,jsonb,text,integer,integer,text,text,integer,jsonb,jsonb,boolean,text,text) to service_role;
revoke all on function public.depart_game_seat_if_version(uuid,bigint,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.depart_game_seat_if_version(uuid,bigint,integer,text,jsonb) to service_role;
revoke all on function public.advance_departure_if_version(uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.advance_departure_if_version(uuid,bigint,text,jsonb) to service_role;
revoke all on function public.commit_departure_fold(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.commit_departure_fold(uuid,bigint,jsonb) to service_role;
revoke all on function public.clear_completed_human_departures(),public.guard_human_departure() from public,anon,authenticated;

-- Voluntary reveals remain owned by the completed hand's immutable participant,
-- even after the live assignment has been released or claimed by another browser.
create or replace function public.reveal_human_cards_if_version(
  p_game_id uuid,p_hand_number integer,p_expected_version bigint,p_player_token text
) returns setof public.games language plpgsql security invoker set search_path=public as $$
declare g public.games; h public.hands; participant jsonb; seat_id uuid;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found or g.status <> 'complete' or g.hand_number <> p_hand_number then return; end if;
  select * into h from public.hands where game_id=p_game_id and hand_number=p_hand_number
    and status='complete' and final_state #>> '{engineState,hand,completionReason}'='fold';
  if not found then return; end if;
  select player into participant from jsonb_array_elements(h.initial_state #> '{config,players}') player
    where player->>'playerToken'=p_player_token and player->>'controller'='human';
  if participant is null or not exists(
    select 1 from jsonb_array_elements(h.final_state #> '{engineState,hand,players}') player
    where player->>'playerId'=participant->>'id' and jsonb_array_length(player->'holeCards')=2
  ) then return; end if;
  select id into seat_id from public.game_players where game_id=p_game_id and seat=(participant->>'seat')::integer;
  if seat_id is null then return; end if;
  if exists(select 1 from public.hand_card_reveals where hand_id=h.id and engine_player_id=participant->>'id') then
    return next g; return;
  end if;
  if g.version <> p_expected_version then return; end if;
  insert into public.hand_card_reveals(game_id,hand_id,player_id,hand_number,engine_player_id,reason)
    values(p_game_id,h.id,seat_id,p_hand_number,participant->>'id','voluntary');
  return query update public.games set version=version+1 where id=p_game_id returning *;
end; $$;


-- Reconcile human departures already completed by the previous application.
-- Each game UPDATE holds its row lock, runs the same atomic cleanup trigger and
-- increments the version so polling clients cannot retain stale assignments.
update public.games g set current_state=g.current_state, version=g.version+1
where g.status='complete' and exists(select 1 from public.game_players p
  where p.game_id=g.id and p.controller='human' and p.status='claimed' and p.leaving);

-- A new occupant gets a new engine identity; owned seat moves retain identity.
-- Reusing a released participant ID would inherit their stack on the next hand.
create or replace function public.claim_game_seat_if_version(
  p_game_id uuid, p_expected_version bigint, p_seat integer,
  p_player_token text, p_name text
)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare locked_game public.games; existing public.game_players; target public.game_players; new_version bigint;
begin
  select * into locked_game from public.games where id = p_game_id for update;
  if not found then return jsonb_build_object('outcome', 'missing'); end if;
  select * into existing from public.game_players where game_id = p_game_id and status = 'claimed' and player_token = p_player_token order by seat limit 1 for update;
  if found and existing.seat = p_seat then return jsonb_build_object('outcome', 'ok', 'seat', to_jsonb(existing), 'version', locked_game.version); end if;
  if existing.leaving then return jsonb_build_object('outcome','unavailable'); end if;
  if locked_game.version <> p_expected_version then return jsonb_build_object('outcome', 'conflict'); end if;
  select * into target from public.game_players where game_id = p_game_id and seat = p_seat for update;
  if not found then return jsonb_build_object('outcome', 'missing'); end if;
  if target.status <> 'open' then return jsonb_build_object('outcome', 'unavailable'); end if;
  if existing.id is not null then
    update public.game_players set status='open', name='Seat '||(existing.seat+1), controller='human', player_token=null, is_host=false, leaving=false, engine_player_id=null,
      bot_id=null, bot_label=null, bot_provider=null, bot_model_id=null, ai_difficulty=null, bot_profile_id=null where id=existing.id;
  end if;
  update public.game_players set status='claimed', controller='human', name=coalesce(nullif(left(btrim(coalesce(p_name,'')),30),''), coalesce(existing.name,'Player '||(p_seat+1))),
    player_token=p_player_token, is_host=coalesce(existing.is_host,false), leaving=false,
    engine_player_id=coalesce(existing.engine_player_id, 'player-'||gen_random_uuid()::text),
    bot_id=null, bot_label=null, bot_provider=null, bot_model_id=null, ai_difficulty=null, bot_profile_id=null
    where id=target.id returning * into target;
  update public.games set version=version+1 where id=p_game_id returning version into new_version;
  return jsonb_build_object('outcome','ok','seat',to_jsonb(target),'version',new_version);
end; $$;

