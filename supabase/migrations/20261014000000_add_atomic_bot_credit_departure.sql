-- Fold a credit-limited LLM bot and mark its seat leaving in one version-checked transaction.
create function public.apply_ai_action_and_leave_if_version(
  p_game_id uuid, p_expected_version bigint, p_player_engine_id text,
  p_current_state jsonb, p_status text, p_hand_number integer,
  p_state_schema_version integer, p_street text, p_action text, p_amount integer,
  p_state_before jsonb, p_state_after jsonb, p_hand_complete boolean,
  p_ai_state jsonb, p_legal_actions jsonb, p_choice text,
  p_bot_id text, p_bot_label text, p_bot_provider text, p_bot_model_id text,
  p_probabilities jsonb, p_confidence numeric, p_raise_size_choice text,
  p_raise_size_probabilities jsonb, p_raw_response jsonb,
  p_matched_rule text, p_prompt_version text, p_duration_ms integer,
  p_usage jsonb, p_cost numeric,
  p_auto_reveal_player_engine_id text default null,
  p_auto_reveal_reason text default null
)
returns setof public.games
language plpgsql security invoker set search_path = public as $$
declare committed_game public.games;
begin
  -- The wrapper shares one transaction and game-row lock with the existing
  -- authoritative action RPC. Conflicts must never leave a seat behind.
  perform 1 from public.games where id=p_game_id for update;
  if not found then return; end if;
  if not exists(select 1 from public.games where id=p_game_id and version=p_expected_version) then return; end if;
  if p_action is distinct from 'fold' or p_choice is distinct from 'fold'
    or p_amount is not null or p_bot_provider is distinct from 'llm'
    or p_matched_rule is distinct from 'llm_credit_limit_exit' then
    raise exception 'Invalid bot credit departure';
  end if;
  if not exists(select 1 from public.game_players where game_id=p_game_id
    and engine_player_id=p_player_engine_id and controller='bot'
    and bot_provider='llm' and bot_id=p_bot_id) then return; end if;

  select * into committed_game from public.apply_ai_action_if_version(
    p_game_id, p_expected_version, p_player_engine_id, p_current_state,
    p_status, p_hand_number, p_state_schema_version, p_street,
    p_action, p_amount, p_state_before, p_state_after,
    p_hand_complete, p_ai_state, p_legal_actions, p_choice,
    p_bot_id, p_bot_label, p_bot_provider, p_bot_model_id,
    p_probabilities, p_confidence, p_raise_size_choice, p_raise_size_probabilities,
    p_raw_response, p_matched_rule, p_prompt_version, p_duration_ms,
    p_usage, p_cost, p_auto_reveal_player_engine_id, p_auto_reveal_reason
  );
  if not found then return; end if;
  update public.game_players set leaving=true, is_host=false
    where game_id=p_game_id and engine_player_id=p_player_engine_id;
  return next committed_game;
end;
$$;

revoke all on function public.apply_ai_action_and_leave_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, text, text, text, text, jsonb,
  numeric, text, jsonb, jsonb, text, text, integer, jsonb, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.apply_ai_action_and_leave_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, text, text, text, text, jsonb,
  numeric, text, jsonb, jsonb, text, text, integer, jsonb, numeric, text, text
) to service_role;
