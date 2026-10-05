-- Runs only against migrated local Supabase; every fixture and helper rolls back.
begin;
create function pg_temp.credit_fold(p_game uuid, p_version bigint, p_actor text default 'credit-bot', p_action text default 'fold')
returns setof public.games language sql as $$
  select * from public.apply_ai_action_and_leave_if_version(
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
create function pg_temp.reject_credit_departure() returns trigger language plpgsql as $$
begin
  if new.leaving and new.name = 'Credit Exit Fixture' then raise exception 'test departure failure'; end if;
  return new;
end;
$$;
create trigger credit_departure_failure before update on public.game_players
for each row execute function pg_temp.reject_credit_departure();

set local role service_role;
do $$
declare fixture uuid := gen_random_uuid(); result public.games; fn oid;
begin
  select oid into fn from pg_proc where pronamespace='public'::regnamespace
    and proname='apply_ai_action_and_leave_if_version';
  assert not has_function_privilege('anon',fn,'execute'), 'Anonymous callers cannot fold bots';
  assert not has_function_privilege('authenticated',fn,'execute'), 'Authenticated callers cannot fold bots';
  assert has_function_privilege('service_role',fn,'execute');
  insert into public.games(id,status,current_state,hand_number) values(fixture,'playing','{}',1);
  insert into public.game_players(game_id,seat,name,controller,stack,status,engine_player_id,
    bot_id,bot_label,bot_provider,bot_model_id,bot_profile_id)
    values(fixture,0,'Credit Exit Fixture','bot',1000,'bot','credit-bot',
      'credit-llm','LLM','llm','mock','balanced');
  insert into public.hands(game_id,hand_number,status,initial_state) values(fixture,1,'playing','{}');

  assert (select count(*) from pg_temp.credit_fold(fixture,0,'unknown-bot')) = 0;
  begin
    perform pg_temp.credit_fold(fixture,0,'credit-bot','check');
    raise exception 'Invalid action unexpectedly accepted';
  exception when others then
    if sqlerrm <> 'Invalid bot credit departure' then raise; end if;
  end;
  -- A failure after the action RPC must roll back both the fold and its audit.
  begin
    perform pg_temp.credit_fold(fixture,0);
    raise exception 'Departure failure was not propagated';
  exception when others then
    if sqlerrm <> 'test departure failure' then raise; end if;
  end;
  assert (select version from public.games where id=fixture) = 0;
  assert (select status from public.hands where game_id=fixture) = 'playing';
  assert not (select leaving from public.game_players where game_id=fixture);
  assert (select count(*) from public.actions where game_id=fixture) = 0;
  assert (select count(*) from public.ai_decisions where game_id=fixture) = 0;
end;
$$;
reset role;
drop trigger credit_departure_failure on public.game_players;
set local role service_role;
do $$
declare fixture uuid := gen_random_uuid(); result public.games;
begin
  insert into public.games(id,status,current_state,hand_number) values(fixture,'playing','{}',1);
  insert into public.game_players(game_id,seat,name,controller,stack,status,engine_player_id,
    bot_id,bot_label,bot_provider,bot_model_id,bot_profile_id)
    values(fixture,0,'Credit Exit Fixture','bot',1000,'bot','credit-bot',
      'credit-llm','LLM','llm','mock','balanced');
  insert into public.hands(game_id,hand_number,status,initial_state) values(fixture,1,'playing','{}');
  select * into result from pg_temp.credit_fold(fixture,0);
  assert result.version = 1 and result.status = 'complete';
  assert (select leaving from public.game_players where game_id=fixture);
  assert (select count(*) from public.actions where game_id=fixture and action='fold') = 1;
  assert (select count(*) from public.ai_decisions where game_id=fixture and matched_rule='llm_credit_limit_exit') = 1;
  assert (select status from public.hands where game_id=fixture) = 'complete';
  assert (select count(*) from pg_temp.credit_fold(fixture,0)) = 0, 'Stale fold cannot commit';
  assert (select version from public.games where id=fixture) = 1;
  assert (select count(*) from public.actions where game_id=fixture) = 1;
end;
$$;
rollback;
