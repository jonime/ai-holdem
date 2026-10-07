-- Disposable fixtures; preserve local games and fair-use counters.
begin;
create function pg_temp.removal_fixture(p_status text default 'waiting') returns uuid language plpgsql as $$
declare f uuid:=gen_random_uuid();
begin
  insert into public.games(id,status,current_state,hand_number) values(f,p_status,'{"engineState":{"hand":{"currentActorSeat":0,"players":[{"playerId":"a","seat":0},{"playerId":"b","seat":1}]}},"config":{"players":[]}}',1);
  insert into public.game_hosts(game_id,host_token) values(f,'removal-host');
  insert into public.game_players(game_id,seat,name,controller,stack,status,player_token,engine_player_id)
    values(f,0,'Host','human',1000,'claimed','removal-host','a'),(f,1,'Guest','human',1000,'claimed','removal-guest','b');
  insert into public.hands(game_id,hand_number,status,initial_state) values(f,1,'playing','{}');
  return f;
end; $$;
create function pg_temp.reject_removal_delete() returns trigger language plpgsql as $$
begin
  if old.id::text=current_setting('test.removal_fail_id',true) then raise exception 'fixture deletion failure'; end if;
  return old;
end; $$;
create trigger removal_rollback_fixture before delete on public.games for each row execute function pg_temp.reject_removal_delete();
set local role service_role;
do $$
declare f uuid; response jsonb; h uuid; p uuid; old uuid; i integer; fn oid;
begin
  for fn in select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('remove_game_if_version','list_my_games','claim_game_seat_before_removal') loop
    assert not has_function_privilege('anon',fn,'execute');
    assert not has_function_privilege('authenticated',fn,'execute');
    assert has_function_privilege('service_role',fn,'execute');
  end loop;
  assert not has_table_privilege('anon','public.personal_game_exclusions','select');
  assert not has_table_privilege('authenticated','public.personal_game_exclusions','select');
  f:=pg_temp.removal_fixture();
  assert public.remove_game_if_version(f,0,'intruder','delete')->>'outcome'='forbidden';
  assert public.remove_game_if_version(f,0,'removal-host','leave_and_remove')->>'outcome'='forbidden';
  assert public.remove_game_if_version(f,0,'removal-guest','delete')->>'outcome'='forbidden';
  assert public.remove_game_if_version(f,1,'removal-host','delete')->>'outcome'='conflict';
  assert public.remove_game_if_version(f,0,'removal-host','delete')->>'outcome'='blocked';
  assert exists(select 1 from public.list_my_games('removal-host') where game_id=f and removal='deletion_blocked' and version=0);
  -- Zero-stack/folded/eliminated assignments still block; leaving is not release.
  update public.game_players set stack=0,leaving=true where game_id=f and seat=1;
  assert public.remove_game_if_version(f,0,'removal-host','delete')->>'outcome'='blocked';
  response:=public.remove_game_if_version(f,0,'removal-guest','leave_and_remove');
  assert response->>'outcome'='ok';
  assert not exists(select 1 from public.list_my_games('removal-guest') where game_id=f);
  assert public.remove_game_if_version(f,1,'removal-host','delete')->>'outcome'='ok';
  assert not exists(select 1 from public.games where id=f);

  -- Active out-of-turn removal is irreversible and repeated pending removal is safe.
  f:=pg_temp.removal_fixture('playing');
  response:=public.remove_game_if_version(f,0,'removal-guest','leave_and_remove');
  assert response->>'outcome'='ok' and response->>'version'='1';
  assert exists(select 1 from public.game_players where game_id=f and seat=1 and leaving and status='claimed');
  assert public.remove_game_if_version(f,1,'removal-host','delete')->>'outcome'='blocked';
  assert public.remove_game_if_version(f,1,'removal-guest','leave_and_remove')->>'version'='1';
  assert public.claim_game_seat_if_version(f,1,1,'removal-guest',null)->>'outcome'='ok';
  assert exists(select 1 from public.personal_game_exclusions where game_id=f and player_token='removal-guest');
  assert public.remove_game_if_version(f,0,'removal-guest','leave_and_remove')->>'outcome'='conflict';

  -- An invalid prepared fold rolls back both departure and exclusion.
  f:=pg_temp.removal_fixture('playing');
  begin
    perform public.remove_game_if_version(f,0,'removal-guest','leave_and_remove','{"playerEngineId":"wrong"}');
    raise exception 'invalid fold accepted';
  exception when others then
    if sqlerrm='invalid fold accepted' then raise; end if;
  end;
  assert (select version=0 from public.games where id=f);
  assert not exists(select 1 from public.game_players where game_id=f and leaving);
  assert not exists(select 1 from public.personal_game_exclusions where game_id=f);

  -- Completed/bot-only deletion removes restrictive history before player cascades.
  f:=pg_temp.removal_fixture('complete');
  update public.game_players set controller='bot',status='bot',player_token=null,bot_id='rules',bot_label='Rules',bot_provider='rules',ai_difficulty='medium' where game_id=f and seat=1;
  select id into h from public.hands where game_id=f;
  select id into p from public.game_players where game_id=f and seat=0;
  insert into public.actions(game_id,hand_id,player_id,sequence,street,action,state_before,state_after) values(f,h,p,1,'preflop','fold','{}','{}');
  insert into public.hand_card_reveals(game_id,hand_id,player_id,hand_number,engine_player_id,reason) values(f,h,p,1,'a','voluntary');
  insert into public.game_listings(game_id,is_public) values(f,false);
  insert into public.personal_game_exclusions values(f,'visitor');
  insert into public.bot_step_claims(game_id,expected_version,actor_engine_id,claim_token,expires_at) values(f,0,'b',gen_random_uuid(),now()+interval '90 seconds');
  insert into public.usage_allowances(key,last_seen,attempts) values('inference:game:'||f,now(),array[now()]);
  perform set_config('test.removal_fail_id',f::text,true);
  begin
    perform public.remove_game_if_version(f,0,'removal-host','delete');
    raise exception 'failed delete committed';
  exception when others then
    if sqlerrm <> 'fixture deletion failure' then raise; end if;
  end;
  assert exists(select 1 from public.games where id=f);
  assert exists(select 1 from public.actions where game_id=f);
  assert exists(select 1 from public.hands where game_id=f);
  assert exists(select 1 from public.hand_card_reveals where game_id=f);
  assert exists(select 1 from public.bot_step_claims where game_id=f);
  perform set_config('test.removal_fail_id','',true);
  assert public.remove_game_if_version(f,0,'removal-host','delete')->>'outcome'='ok';
  assert not exists(select 1 from public.actions where game_id=f);
  assert not exists(select 1 from public.hands where game_id=f);
  assert not exists(select 1 from public.hand_card_reveals where game_id=f);
  assert not exists(select 1 from public.game_players where game_id=f);
  assert not exists(select 1 from public.bot_step_claims where game_id=f);
  assert not exists(select 1 from public.game_hosts where game_id=f);
  assert not exists(select 1 from public.game_listings where game_id=f);
  assert not exists(select 1 from public.personal_game_exclusions where game_id=f);
  assert exists(select 1 from public.usage_allowances where key='inference:game:'||f and cardinality(attempts)=1);
  assert public.remove_game_if_version(f,0,'removal-host','delete')->>'outcome'='missing';

  -- A table with only bots remains deletable by its durable unseated host.
  f:=pg_temp.removal_fixture();
  update public.game_players set controller='bot',status='bot',player_token=null,bot_id='rules',bot_label='Rules',bot_provider='rules',ai_difficulty='medium' where game_id=f;
  assert public.remove_game_if_version(f,0,'removal-host','delete')->>'outcome'='ok';

  -- Public joins restore exclusions when they successfully claim a new seat.
  f:=pg_temp.removal_fixture();
  assert public.remove_game_if_version(f,0,'removal-guest','leave_and_remove')->>'outcome'='ok';
  insert into public.game_listings(game_id,is_public,host_lease_expires_at,published_at) values(f,true,now()+interval '2 minutes',now());
  assert public.join_public_game_if_version(f,1,'removal-guest',null)->>'outcome'='joined';
  assert not exists(select 1 from public.personal_game_exclusions where game_id=f);

  -- Exclusion precedes the five-row limit; a successful new claim restores visibility.
  for i in 1..6 loop
    f:=pg_temp.removal_fixture('playing');
    update public.game_players set player_token='list-owner' where game_id=f and seat=1;
    update public.games set updated_at=now()+i*interval '1 minute' where id=f;
    if i=1 then old:=f; end if;
    if i=6 then
      assert public.remove_game_if_version(f,0,'list-owner','leave_and_remove')->>'outcome'='ok';
    end if;
  end loop;
  assert (select count(*) from public.list_my_games('list-owner'))=5;
  assert exists(select 1 from public.list_my_games('list-owner') where game_id=old);
  update public.games set status='complete' where id=f;
  assert public.claim_game_seat_if_version(f,1,1,'list-owner',null)->>'outcome'='ok';
  assert not exists(select 1 from public.personal_game_exclusions where game_id=f and player_token='list-owner');
  assert exists(select 1 from public.list_my_games('list-owner') where game_id=f);
end; $$;
set local role anon;
do $$ begin
  begin perform public.remove_game_if_version(gen_random_uuid(),0,'owner','delete'); raise exception 'anon removal allowed'; exception when insufficient_privilege then null; end;
  begin perform * from public.personal_game_exclusions; raise exception 'anon exclusions exposed'; exception when insufficient_privilege then null; end;
end; $$;
set local role authenticated;
do $$ begin
  begin perform public.remove_game_if_version(gen_random_uuid(),0,'owner','delete'); raise exception 'authenticated removal allowed'; exception when insufficient_privilege then null; end;
end; $$;
rollback;
