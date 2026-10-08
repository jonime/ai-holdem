begin;
create function pg_temp.timer_action(id uuid,v bigint,decision uuid default null,driver text default null,actor text default 'a',next_actor text default 'b',complete boolean default false,multiplayer boolean default true)
returns jsonb language plpgsql as $$
declare before_state jsonb; after_state jsonb;
begin
  select current_state into before_state from public.games where games.id=timer_action.id;
  after_state := jsonb_set(before_state,'{engineState,revision}',to_jsonb(v+1));
  return public.commit_with_turn_timer('apply_human_action_if_version',jsonb_build_object(
    'p_game_id',id,'p_expected_version',v,'p_player_engine_id',actor,'p_current_state',after_state,
    'p_status',case when complete then 'complete' else 'playing' end,'p_hand_number',1,'p_state_schema_version',1,
    'p_street','preflop','p_action','check','p_amount',null,'p_state_before',before_state,'p_state_after',after_state,'p_hand_complete',complete),
    jsonb_build_object('handNumber',1,'multiplayer',multiplayer,'actorEngineId',next_actor),decision,driver);
end; $$;
set local role service_role;
do $$
#variable_conflict use_variable
declare id uuid:=gen_random_uuid(); g public.games; r jsonb; first_id uuid; deadline timestamptz; state jsonb;
begin
  assert not has_function_privilege('anon','public.commit_with_turn_timer(text,jsonb,jsonb,uuid,text)','execute');
  assert not has_function_privilege('authenticated','public.commit_with_turn_timer(text,jsonb,jsonb,uuid,text)','execute');
  insert into public.games(id,status,current_state,hand_number) values(id,'waiting','{"config":{"humanTurnSeconds":60},"engineState":{}}',0);
  insert into public.game_hosts(game_id,host_token) values(id,'host');
  insert into public.game_players(game_id,seat,name,controller,stack,status,engine_player_id,player_token)
    values(id,0,'A','human',1000,'claimed','a','owner-a'),(id,1,'B','human',1000,'claimed','b','owner-b');
  state := '{"config":{"humanTurnSeconds":60},"engineState":{"revision":1}}';
  r := public.commit_with_turn_timer('start_game_if_version',jsonb_build_object('p_game_id',id,'p_expected_version',0,
    'p_current_state',state,'p_hand_number',1,'p_state_schema_version',1),
    '{"handNumber":1,"multiplayer":true,"actorEngineId":"a"}');
  assert jsonb_array_length(r)=1;
  select * into g from public.games where games.id=id;
  assert g.human_timer_enabled and g.turn_actor_engine_id='a' and g.turn_hand_number=1;
  assert g.turn_deadline between clock_timestamp()+interval '58 seconds' and clock_timestamp()+interval '61 seconds';
  first_id:=g.turn_decision_id; deadline:=g.turn_deadline;
  assert r->0->>'server_time' is not null;
  assert public.get_game_read_snapshot(id)#>>'{game,server_time}' is not null;
  update public.games set version=version+1 where games.id=id;
  assert (select turn_decision_id=first_id and turn_deadline=deadline from public.games where games.id=id);
  r:=pg_temp.timer_action(id,2,first_id,'owner-b');
  assert r->>'timerError'='TURN_NOT_EXPIRED' and (r->>'retryAfterMs')::integer>0;
  begin
    perform pg_temp.timer_action(id,2,first_id,'spectator');
    raise exception 'Expected forbidden';
  exception when raise_exception then assert sqlerrm='TURN_FORBIDDEN'; end;
  assert pg_temp.timer_action(id,1,first_id,'host')='[]'::jsonb;
  assert pg_temp.timer_action(id,2,gen_random_uuid(),'host')='[]'::jsonb;
  begin
    perform public.apply_human_action_if_version(id,2,'a',jsonb_set(state,'{engineState,revision}','2'),'playing',1,1,'preflop','check',null,state,state,false);
    raise exception 'Expected legacy fence';
  exception when raise_exception then assert sqlerrm='TURN_TRANSITION_REQUIRED'; end;
  update public.games set turn_deadline=clock_timestamp()-interval '1 second' where games.id=id;
  r:=pg_temp.timer_action(id,2);
  assert r->>'timerError'='TURN_EXPIRED';
  assert (select version=2 from public.games where games.id=id);
  r:=pg_temp.timer_action(id,2,first_id,'owner-a','a','a',false,false);
  assert jsonb_array_length(r)=1;
  select * into g from public.games where games.id=id;
  assert g.version=3 and g.turn_decision_id<>first_id and g.turn_actor_engine_id='a' and g.human_timer_enabled;
  assert g.turn_deadline>clock_timestamp(); -- Same actor still gets a new decision.
  assert pg_temp.timer_action(id,3,first_id,'host')='[]'::jsonb;
  update public.games set turn_deadline=clock_timestamp()-interval '1 second' where games.id=id;
  perform pg_temp.timer_action(id,3,g.turn_decision_id,'host','a',null,true);
  assert (select turn_decision_id is null and turn_deadline is null from public.games where games.id=id);
  assert (select count(*)=2 from public.actions where game_id=id);
  assert (select count(*)=2 from public.game_players where game_id=id and status='claimed' and not leaving);
  -- Solo suppression remains frozen when later transitions report multiplayer.
  insert into public.games(id,status,current_state,hand_number) values(gen_random_uuid(),'waiting','{}',0) returning * into g;
  assert g.human_turn_seconds is null and g.turn_deadline is null;
  update public.games set current_state='{"config":{"humanTurnSeconds":30},"engineState":{}}' where games.id=g.id;
  perform public.commit_with_turn_timer('start_game_if_version',jsonb_build_object('p_game_id',g.id,'p_expected_version',0,
    'p_current_state',state,'p_hand_number',1,'p_state_schema_version',1),'{"handNumber":1,"multiplayer":false,"actorEngineId":"a"}');
  assert (select not human_timer_enabled and turn_deadline is null from public.games where games.id=g.id);
end; $$;
rollback;
