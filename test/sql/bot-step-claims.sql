-- Local fixtures and helper functions roll back; no existing games are changed.
begin;
create function pg_temp.claim_action(p_game uuid, p_version bigint, p_token uuid, p_actor text default 'credit-bot', p_action text default 'fold', p_reveal boolean default false)
returns setof public.games language sql as $$
  select * from public.commit_bot_action_with_claim(
    p_claim_token => p_token,
    p_game_id => p_game, p_expected_version => p_version, p_player_engine_id => p_actor,
    p_current_state => '{"stateSchemaVersion":1}', p_status => 'complete', p_hand_number => 1,
    p_state_schema_version => 1, p_street => 'preflop', p_action => p_action, p_amount => null,
    p_state_before => '{}', p_state_after => '{}', p_hand_complete => true,
    p_ai_state => '{}', p_legal_actions => '[{"type":"fold"}]', p_choice => p_action,
    p_bot_id => 'credit-llm', p_bot_label => 'LLM', p_bot_provider => 'llm', p_bot_model_id => 'mock',
    p_probabilities => null, p_confidence => null, p_raise_size_choice => null,
    p_raise_size_probabilities => null, p_raw_response => 'null',
    p_matched_rule => 'llm_credit_limit_exit', p_prompt_version => null, p_duration_ms => null,
    p_usage => null, p_cost => null,
    p_auto_reveal_player_engine_id => case when p_reveal then p_actor else null end,
    p_auto_reveal_reason => case when p_reveal then 'bot_uncontested' else null end
  );
$$;
create function pg_temp.claim_departure(p_game uuid, p_version bigint, p_token uuid, p_actor text default 'credit-bot', p_action text default 'fold')
returns setof public.games language sql as $$
  select * from public.commit_bot_departure_with_claim(
    p_claim_token => p_token,
    p_game_id => p_game, p_expected_version => p_version, p_player_engine_id => p_actor,
    p_current_state => '{"stateSchemaVersion":1}', p_status => 'complete', p_hand_number => 1,
    p_state_schema_version => 1, p_street => 'preflop', p_action => p_action, p_amount => null,
    p_state_before => '{}', p_state_after => '{}', p_hand_complete => true,
    p_ai_state => '{}', p_legal_actions => '[{"type":"fold"}]', p_choice => p_action,
    p_bot_id => 'credit-llm', p_bot_label => 'LLM', p_bot_provider => 'llm', p_bot_model_id => 'mock',
    p_probabilities => null, p_confidence => null, p_raise_size_choice => null,
    p_raise_size_probabilities => null, p_raw_response => 'null',
    p_matched_rule => 'llm_credit_limit_exit', p_prompt_version => null, p_duration_ms => null,
    p_usage => null, p_cost => null
  );
$$;

create function pg_temp.reject_claim_departure() returns trigger language plpgsql as $$
begin
  if new.leaving and new.name='Claim Fixture' then raise exception 'test departure failure'; end if;
  return new;
end;
$$;
create trigger claim_departure_failure before update on public.game_players
for each row execute function pg_temp.reject_claim_departure();
set local role service_role;
do $$
declare fixture uuid := gen_random_uuid(); token uuid := gen_random_uuid(); replacement uuid := gen_random_uuid(); fn oid; result jsonb;
begin
  assert to_regclass('public.ai_decisions') is null;
  assert to_regprocedure('public.get_hand_history(uuid,integer)') is null;
  assert to_regprocedure('public.set_ai_decision_bot_profile()') is null;
  assert not has_table_privilege('anon','public.bot_step_claims','select');
  assert not has_table_privilege('authenticated','public.bot_step_claims','insert');
  for fn in select oid from pg_proc where pronamespace='public'::regnamespace and proname in (
    'acquire_bot_step_claim','release_bot_step_claim','commit_bot_action_with_claim','commit_bot_departure_with_claim') loop
    assert not has_function_privilege('anon',fn,'execute');
    assert not has_function_privilege('authenticated',fn,'execute');
    assert has_function_privilege('service_role',fn,'execute');
  end loop;
  insert into public.games(id,status,current_state,hand_number,bots_show_uncontested_wins)
    values(fixture,'playing','{}',1,true);
  insert into public.game_players(game_id,seat,name,controller,stack,status,engine_player_id,
    bot_id,bot_label,bot_provider,bot_model_id,bot_profile_id)
    values(fixture,0,'Claim Fixture','bot',1000,'bot','credit-bot','credit-llm','LLM','llm','mock','balanced');
  insert into public.hands(game_id,hand_number,status,initial_state) values(fixture,1,'playing','{}');
  assert public.acquire_bot_step_claim(fixture,1,'credit-bot',token)->>'outcome'='conflict';
  assert public.acquire_bot_step_claim(fixture,0,'unknown',token)->>'outcome'='conflict';
  assert public.acquire_bot_step_claim(fixture,0,'credit-bot',token)->>'outcome'='acquired';
  result := public.acquire_bot_step_claim(fixture,0,'credit-bot',replacement);
  assert result->>'outcome'='busy';
  assert (result->>'retryAfterMs')::int between 1 and 90000;
  assert (select version from public.games where id=fixture)=0;
  begin
    perform pg_temp.claim_action(fixture,0,replacement);
    raise exception 'Unowned commit accepted';
  exception when others then if sqlerrm <> 'BOT_STEP_CLAIM_LOST' then raise; end if; end;
  begin
    perform pg_temp.claim_action(fixture,0,token,'unknown');
    raise exception 'Wrong actor accepted';
  exception when others then if sqlerrm <> 'BOT_STEP_CLAIM_LOST' then raise; end if; end;
  update public.bot_step_claims set expires_at=clock_timestamp()-interval '1 second' where game_id=fixture;
  begin
    perform pg_temp.claim_action(fixture,0,token);
    raise exception 'Expired commit accepted';
  exception when others then if sqlerrm <> 'BOT_STEP_CLAIM_LOST' then raise; end if; end;
  begin
    perform pg_temp.claim_departure(fixture,0,token);
    raise exception 'Expired departure accepted';
  exception when others then if sqlerrm <> 'BOT_STEP_CLAIM_LOST' then raise; end if; end;
  assert public.acquire_bot_step_claim(fixture,0,'credit-bot',replacement)->>'outcome'='acquired';
  perform public.release_bot_step_claim(fixture,token);
  assert (select claim_token from public.bot_step_claims where game_id=fixture)=replacement;
  begin
    perform pg_temp.claim_action(fixture,0,token);
    raise exception 'Replaced token accepted';
  exception when others then if sqlerrm <> 'BOT_STEP_CLAIM_LOST' then raise; end if; end;
  -- Existing departure errors roll back the action and claim consumption.
  begin
    perform pg_temp.claim_departure(fixture,0,replacement);
    raise exception 'Departure failure ignored';
  exception when others then if sqlerrm <> 'test departure failure' then raise; end if; end;
  assert (select version from public.games where id=fixture)=0;
  assert (select count(*) from public.actions where game_id=fixture)=0;
  assert (select claim_token from public.bot_step_claims where game_id=fixture)=replacement;
  perform pg_temp.claim_action(fixture,0,replacement,p_reveal => true);
  assert (select version from public.games where id=fixture)=1;
  assert not exists(select 1 from public.bot_step_claims where game_id=fixture);
  assert (select count(*) from public.actions where game_id=fixture)=1;
  assert (select status from public.hands where game_id=fixture)='complete';
  assert (select count(*) from public.hand_card_reveals where game_id=fixture
    and hand_number=1 and engine_player_id='credit-bot' and reason='bot_uncontested')=1;
  assert not (select leaving from public.game_players where game_id=fixture);
  assert (select count(*) from pg_temp.claim_action(fixture,0,replacement))=0;
end;
$$;
reset role;
drop trigger claim_departure_failure on public.game_players;
set local role service_role;
do $$
declare fixture uuid := gen_random_uuid(); token uuid := gen_random_uuid();
begin
  insert into public.games(id,status,current_state,hand_number) values(fixture,'playing','{}',1);
  insert into public.game_players(game_id,seat,name,controller,stack,status,engine_player_id,
    bot_id,bot_label,bot_provider,bot_model_id,bot_profile_id)
    values(fixture,0,'Claim Fixture','bot',1000,'bot','credit-bot','credit-llm','LLM','llm','mock','balanced');
  insert into public.hands(game_id,hand_number,status,initial_state) values(fixture,1,'playing','{}');
  assert public.acquire_bot_step_claim(fixture,0,'credit-bot',token)->>'outcome'='acquired';
  -- A version advance makes a claim obsolete even if its lease has time left.
  update public.games set version=1 where id=fixture;
  assert public.acquire_bot_step_claim(fixture,1,'credit-bot',token)->>'outcome'='acquired';
  perform pg_temp.claim_departure(fixture,1,token);
  assert (select version from public.games where id=fixture)=2;
  assert not exists(select 1 from public.bot_step_claims where game_id=fixture);
  assert (select leaving from public.game_players where game_id=fixture);
  assert (select count(*) from public.actions where game_id=fixture and action='fold')=1;
  assert (select status from public.hands where game_id=fixture)='complete';
  delete from public.games where id=fixture;
  assert not exists(select 1 from public.bot_step_claims where game_id=fixture);
end;
$$;
rollback;
