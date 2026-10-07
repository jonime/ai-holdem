-- Engine legality and side pots are tested through the actual adapter in Vitest.
-- These transaction fixtures test DB authorization, identity, concurrency fences,
-- history and cleanup without depending on application secrets or providers.
begin;
create function pg_temp.departure_fixture(p_status text default 'playing') returns uuid language plpgsql as $$
declare fixture uuid:=gen_random_uuid(); state jsonb;
begin
  state := '{"stateSchemaVersion":1,"config":{"players":[{"id":"a","seat":0,"name":"Original A","controller":"human","playerToken":"departure-host"},{"id":"b","seat":1,"name":"Original B","controller":"human","playerToken":"departure-guest"}]},"engineState":{"hand":{"currentActorSeat":0,"players":[{"playerId":"a","seat":0,"holeCards":["As","Ah"]},{"playerId":"b","seat":1,"holeCards":["Ks","Kh"]}]}}}';
  insert into public.games(id,status,current_state,hand_number) values(fixture,p_status,state,1);
  insert into public.game_hosts(game_id,host_token) values(fixture,'departure-host');
  insert into public.game_players(game_id,seat,name,controller,stack,status,engine_player_id,player_token,is_host)
    values(fixture,0,'Original A','human',1000,'claimed','a','departure-host',true),
      (fixture,1,'Original B','human',1000,'claimed','b','departure-guest',false);
  insert into public.hands(game_id,hand_number,status,initial_state) values(fixture,1,'playing',state);
  return fixture;
end; $$;
create function pg_temp.fold_input(p_game uuid,p_actor text,p_complete boolean default false) returns jsonb language sql as $$
  select jsonb_build_object('playerEngineId',p_actor,'action','fold','amount',null,
    'handNumber',1,'stateSchemaVersion',1,'street','preflop','status',case when p_complete then 'complete' else 'playing' end,
    'handComplete',p_complete,'stateBefore',current_state,'currentState',
      jsonb_set(jsonb_set(current_state,'{engineState,hand,currentActorSeat}',case when p_complete then 'null'::jsonb else '1'::jsonb end),
        '{engineState,hand,completionReason}',case when p_complete then '"fold"'::jsonb else 'null'::jsonb end))
  from public.games where id=p_game;
$$;
set local role service_role;
do $$
declare f uuid; response jsonb; fold jsonb; committed public.games; fn oid; token uuid;
begin
  for fn in select oid from pg_proc where pronamespace='public'::regnamespace and proname in
    ('depart_game_seat_if_version','advance_departure_if_version','commit_departure_fold') loop
    assert not has_function_privilege('anon',fn,'execute');
    assert not has_function_privilege('authenticated',fn,'execute');
    assert has_function_privilege('service_role',fn,'execute');
  end loop;
  -- Waiting and completed assignments release immediately; durable hosts stay.
  foreach response in array array['"waiting"'::jsonb,'"complete"'::jsonb] loop
    f := pg_temp.departure_fixture(response #>> '{}');
    response := public.depart_game_seat_if_version(f,0,0,'departure-host',null);
    assert response->>'outcome'='ok'; assert response #>> '{seat,status}'='open';
    assert response #>> '{seat,player_token}' is null;
    assert exists(select 1 from public.game_hosts where game_id=f and host_token='departure-host');
    assert exists(select 1 from public.list_my_games('departure-host') where game_id=f);
  end loop;
  -- Out-of-turn registration changes no engine state or history and is irreversible.
  f := pg_temp.departure_fixture();
  response := public.depart_game_seat_if_version(f,0,1,'intruder',null);
  assert response->>'outcome'='forbidden';
  response := public.depart_game_seat_if_version(f,0,1,'departure-guest',null);
  assert response #>> '{seat,leaving}'='true'; assert (select version from public.games where id=f)=1;
  assert (select count(*) from public.actions where game_id=f)=0;
  response := public.depart_game_seat_if_version(f,1,1,'departure-guest',null);
  assert response->>'version'='1';
  begin
    update public.game_players set leaving=false where game_id=f and seat=1;
    raise exception 'cancel unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'Departure cannot be cancelled during a hand' then raise; end if;
  end;
  fold := pg_temp.fold_input(f,'a');
  assert (select count(*) from public.advance_departure_if_version(f,1,'intruder',fold))=0;
  begin
    perform public.advance_departure_if_version(f,1,'departure-host',fold);
    raise exception 'ordinary actor advanced';
  exception when others then
    if sqlerrm <> 'Invalid departure fold' then raise; end if;
  end;
  -- Current-turn registration folds once in the same transaction.
  response := public.depart_game_seat_if_version(f,1,0,'departure-host',fold);
  assert response->>'version'='2';
  assert (select count(*) from public.actions where game_id=f and action='fold' and amount is null)=1;
  -- Stale and repeated requests do not add actions. Host can continue consecutive humans.
  response := public.depart_game_seat_if_version(f,1,0,'departure-host',fold);
  assert response->>'outcome'='conflict';
  fold := pg_temp.fold_input(f,'b',true);
  assert (select count(*) from public.apply_human_action_if_version(f,2,'b',fold->'currentState',
    'complete',1,1,'preflop','check',null,fold->'stateBefore',fold->'currentState',true))=0;
  assert (select version from public.games where id=f)=2;
  assert (select count(*) from public.advance_departure_if_version(f,1,'departure-host',fold))=0;
  select * into committed from public.advance_departure_if_version(f,2,'departure-host',fold);
  assert committed.status='complete' and committed.version=3;
  assert (select count(*) from public.game_players where game_id=f and status='open' and player_token is null and engine_player_id is null)=2;
  assert (select count(*) from public.actions where game_id=f and action='fold')=2;
  assert (select initial_state #>> '{config,players,0,name}' from public.hands where game_id=f)='Original A';
  assert (select final_state #>> '{config,players,1,name}' from public.hands where game_id=f)='Original B';
  assert exists(select 1 from public.list_my_games('departure-host') where game_id=f);
  assert not exists(select 1 from public.list_my_games('departure-guest') where game_id=f);
  -- Releasing ownership does not reveal cards. Only the original participant can opt in.
  assert not exists(select 1 from public.hand_card_reveals where game_id=f);
  response := public.claim_game_seat_if_version(f,3,1,'replacement-owner','Replacement');
  assert response->>'outcome'='ok';
  assert response #>> '{seat,engine_player_id}' <> 'b';
  assert (select count(*) from public.reveal_human_cards_if_version(f,1,4,'replacement-owner'))=0;
  assert (select count(*) from public.reveal_human_cards_if_version(f,1,4,'intruder'))=0;
  assert (select count(*) from public.reveal_human_cards_if_version(f,1,4,'departure-guest'))=1;
  assert exists(select 1 from public.hand_card_reveals where game_id=f and engine_player_id='b' and reason='voluntary');
  -- A bot-completing action uses exactly the same atomic human-seat cleanup.
  f := pg_temp.departure_fixture();
  response := public.depart_game_seat_if_version(f,0,1,'departure-guest',null);
  update public.game_players set controller='bot',status='bot',player_token=null,
    bot_id='rules',bot_label='Rules',bot_provider='rules',ai_difficulty='medium'
    where game_id=f and seat=0;
  token := gen_random_uuid();
  assert public.acquire_bot_step_claim(f,1,'a',token)->>'outcome'='acquired';
  fold := pg_temp.fold_input(f,'a',true);
  select * into committed from public.commit_bot_action_with_claim(
    p_claim_token=>token,p_game_id=>f,p_expected_version=>1,p_player_engine_id=>'a',
    p_current_state=>fold->'currentState',p_status=>'complete',p_hand_number=>1,p_state_schema_version=>1,
    p_street=>'preflop',p_action=>'fold',p_amount=>null,p_state_before=>fold->'stateBefore',
    p_state_after=>fold->'currentState',p_hand_complete=>true,p_ai_state=>'{}',p_legal_actions=>'[]',
    p_choice=>'fold',p_bot_id=>'rules',p_bot_label=>'Rules',p_bot_provider=>'rules',p_bot_model_id=>null,
    p_probabilities=>null,p_confidence=>null,p_raise_size_choice=>null,p_raise_size_probabilities=>null,
    p_raw_response=>null,p_matched_rule=>null,p_prompt_version=>null,p_duration_ms=>null,p_usage=>null,p_cost=>null);
  assert committed.status='complete' and committed.version=2;
  assert (select status from public.game_players where game_id=f and seat=1)='open';
  assert (select player_token from public.game_players where game_id=f and seat=1) is null;
  assert (select status from public.game_players where game_id=f and seat=0)='bot';
end; $$;
reset role;
create function pg_temp.fail_cleanup() returns trigger language plpgsql as $$
begin
  if old.name='Reject cleanup' and new.status='open' then raise exception 'cleanup rejected'; end if;
  return new;
end; $$;
create trigger departure_cleanup_failure before update on public.game_players for each row execute function pg_temp.fail_cleanup();
set local role service_role;
do $$
declare f uuid:=pg_temp.departure_fixture(); fold jsonb;
begin
  update public.game_players set name='Reject cleanup' where game_id=f and seat=0;
  fold := pg_temp.fold_input(f,'a',true);
  begin
    perform public.depart_game_seat_if_version(f,0,0,'departure-host',fold);
    raise exception 'cleanup failure ignored';
  exception when others then
    if sqlerrm <> 'cleanup rejected' then raise; end if;
  end;
  assert (select version from public.games where id=f)=0;
  assert (select status from public.hands where game_id=f)='playing';
  assert not (select leaving from public.game_players where game_id=f and seat=0);
  assert not exists(select 1 from public.actions where game_id=f);
end; $$;
rollback;
