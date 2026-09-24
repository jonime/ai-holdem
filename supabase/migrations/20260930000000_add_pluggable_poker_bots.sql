-- Separate seat control from bot implementation and snapshot provider identity
-- on every decision. Existing TypeSafe rows normalize to the Jev profile.

alter table public.game_players drop constraint if exists game_players_controller_check;
alter table public.game_players drop constraint if exists game_players_ai_difficulty_matches_controller;

update public.game_players set controller = 'bot' where controller = 'typesafe_ai';

alter table public.game_players
  add column bot_id text,
  add column bot_label text,
  add column bot_provider text,
  add column bot_model_id text;

update public.game_players
set bot_id = 'jev', bot_label = 'TypeSafe Jev',
    bot_provider = 'typesafe', bot_model_id = 'jev-latest'
where controller = 'bot';

alter table public.game_players
  add constraint game_players_controller_check check (controller in ('human', 'bot')),
  add constraint game_players_bot_provider_check
    check (bot_provider is null or bot_provider in ('typesafe', 'openrouter', 'rules')),
  add constraint game_players_bot_matches_controller check (
    (controller = 'human' and bot_id is null and bot_label is null
      and bot_provider is null and bot_model_id is null and ai_difficulty is null)
    or
    (controller = 'bot' and bot_id is not null and bot_label is not null
      and bot_provider is not null
      and ((bot_provider = 'typesafe' and ai_difficulty is not null)
        or (bot_provider <> 'typesafe' and ai_difficulty is null)))
  );

alter table public.ai_decisions
  alter column probabilities drop not null,
  alter column confidence drop not null,
  alter column raw_response drop not null,
  add column bot_id text,
  add column bot_label text,
  add column bot_provider text,
  add column bot_model_id text,
  add column matched_rule text,
  add column prompt_version text,
  add column duration_ms integer check (duration_ms is null or duration_ms >= 0),
  add column usage jsonb,
  add column cost numeric check (cost is null or cost >= 0);

update public.ai_decisions
set bot_id = 'jev', bot_label = 'TypeSafe Jev',
    bot_provider = 'typesafe', bot_model_id = 'jev-latest';

alter table public.ai_decisions
  alter column bot_id set not null,
  alter column bot_label set not null,
  alter column bot_provider set not null,
  add constraint ai_decisions_bot_provider_check
    check (bot_provider in ('typesafe', 'openrouter', 'rules'));

drop function if exists public.create_game_session(jsonb, integer, integer, text, text, jsonb);

create function public.create_game_session(
  p_current_state jsonb, p_state_schema_version integer,
  p_hand_number integer, p_status text, p_host_token text, p_players jsonb
)
returns setof public.games
language plpgsql security invoker set search_path = public
as $$
declare created_game public.games;
begin
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) < 2 then
    raise exception 'A game session requires at least two configured seats';
  end if;
  if p_host_token is null or p_host_token = '' then
    raise exception 'A game session requires a host token';
  end if;
  insert into public.games (current_state, state_schema_version, hand_number, status)
  values (p_current_state, p_state_schema_version, p_hand_number, p_status)
  returning * into created_game;
  insert into public.game_hosts (game_id, host_token)
  values (created_game.id, p_host_token);
  insert into public.game_players (
    game_id, seat, name, controller, bot_id, bot_label, bot_provider,
    bot_model_id, ai_difficulty, stack, engine_player_id, status,
    player_token, is_host, leaving
  )
  select created_game.id, players.seat, players.name, players.controller,
    players.bot_id, players.bot_label, players.bot_provider, players.bot_model_id,
    players.ai_difficulty, players.stack, players.engine_player_id,
    coalesce(players.status, 'open'), players.player_token,
    coalesce(players.is_host, false), coalesce(players.leaving, false)
  from jsonb_to_recordset(p_players) as players(
    seat integer, name text, controller text, bot_id text, bot_label text,
    bot_provider text, bot_model_id text, ai_difficulty text, stack integer,
    engine_player_id text, status text, player_token text, is_host boolean,
    leaving boolean
  );
  if p_status <> 'waiting' then
    insert into public.hands (game_id, hand_number, status, initial_state)
    values (created_game.id, p_hand_number, 'playing', p_current_state);
  end if;
  return next created_game;
end;
$$;

revoke all on function public.create_game_session(
  jsonb, integer, integer, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_game_session(
  jsonb, integer, integer, text, text, jsonb
) to service_role;

drop function if exists public.apply_ai_action_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, jsonb, numeric, text, jsonb, jsonb,
  text, text
);

create function public.apply_ai_action_if_version(
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
language plpgsql security invoker set search_path = public
as $$
begin
  return query
  with eligible_action as (
    select game_players.id as player_id, hands.id as hand_id
    from public.game_players
    join public.hands on hands.game_id = game_players.game_id
      and hands.hand_number = p_hand_number and hands.status = 'playing'
    where game_players.game_id = p_game_id
      and game_players.engine_player_id = p_player_engine_id
      and game_players.controller = 'bot'
      and game_players.bot_id = p_bot_id
  ), updated_game as (
    update public.games
    set current_state = p_current_state, status = p_status,
      hand_number = p_hand_number, state_schema_version = p_state_schema_version,
      version = version + 1
    from eligible_action
    where games.id = p_game_id and games.version = p_expected_version
    returning games.*, eligible_action.player_id, eligible_action.hand_id
  ), inserted_action as (
    insert into public.actions (
      game_id, hand_id, player_id, sequence, street, action, amount,
      state_before, state_after
    )
    select id, hand_id, player_id,
      (select coalesce(max(sequence), 0) + 1 from public.actions
       where hand_id = updated_game.hand_id),
      p_street, p_action, p_amount, p_state_before, p_state_after
    from updated_game returning hand_id, player_id, sequence
  ), inserted_decision as (
    insert into public.ai_decisions (
      game_id, hand_id, player_id, action_sequence, state, legal_actions,
      choice, bot_id, bot_label, bot_provider, bot_model_id,
      probabilities, confidence, raise_size_choice, raise_size_probabilities,
      raw_response, matched_rule, prompt_version, duration_ms, usage, cost
    )
    select p_game_id, hand_id, player_id, sequence, p_ai_state,
      p_legal_actions, p_choice, p_bot_id, p_bot_label, p_bot_provider,
      p_bot_model_id, p_probabilities, p_confidence, p_raise_size_choice,
      p_raise_size_probabilities, p_raw_response, p_matched_rule,
      p_prompt_version, p_duration_ms, p_usage, p_cost
    from inserted_action returning hand_id
  ), completed_hand as (
    update public.hands set status = 'complete', final_state = p_state_after,
      completed_at = now()
    where p_hand_complete and id in (select hand_id from inserted_decision)
    returning id
  ), auto_reveal as (
    insert into public.hand_card_reveals (
      game_id, hand_id, player_id, hand_number, engine_player_id, reason
    )
    select p_game_id, completed_hand.id, winner.id, p_hand_number,
      p_auto_reveal_player_engine_id, p_auto_reveal_reason
    from completed_hand
    join public.games g on g.id = p_game_id and g.bots_show_uncontested_wins
    join public.game_players winner on winner.game_id = p_game_id
      and winner.engine_player_id = p_auto_reveal_player_engine_id
      and winner.controller = 'bot'
    where p_auto_reveal_player_engine_id is not null
      and p_auto_reveal_reason = 'bot_uncontested'
    on conflict (hand_id, player_id) do nothing returning id
  )
  select id, status, current_state, state_schema_version, hand_number,
    version, created_at, updated_at, min_seats_to_start, bots_show_uncontested_wins
  from updated_game;
end;
$$;

revoke all on function public.apply_ai_action_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, text, text, text, text, jsonb,
  numeric, text, jsonb, jsonb, text, text, integer, jsonb, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.apply_ai_action_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, text, text, text, text, jsonb,
  numeric, text, jsonb, jsonb, text, text, integer, jsonb, numeric, text, text
) to service_role;

create or replace function public.get_hand_history(p_game_id uuid, p_hand_number integer)
returns jsonb language sql security invoker set search_path = public as $$
  select jsonb_build_object(
    'status', hands.status,
    'actions', coalesce((select jsonb_agg(jsonb_build_object(
      'sequence', actions.sequence, 'street', actions.street,
      'action', actions.action, 'amount', actions.amount,
      'player', game_players.name, 'controller', game_players.controller,
      'botId', game_players.bot_id, 'botLabel', game_players.bot_label,
      'botProvider', game_players.bot_provider,
      'botModelId', game_players.bot_model_id
    ) order by actions.sequence)
      from public.actions join public.game_players on game_players.id = actions.player_id
      where actions.hand_id = hands.id), '[]'::jsonb),
    'aiDecisions', case when hands.status = 'complete' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'actionSequence', d.action_sequence, 'state', d.state,
        'legalActions', d.legal_actions, 'choice', d.choice,
        'botId', d.bot_id, 'botLabel', d.bot_label,
        'botProvider', d.bot_provider, 'botModelId', d.bot_model_id,
        'probabilities', d.probabilities, 'confidence', d.confidence,
        'raiseSizeChoice', d.raise_size_choice,
        'raiseSizeProbabilities', d.raise_size_probabilities,
        'rawResponse', d.raw_response, 'matchedRule', d.matched_rule,
        'promptVersion', d.prompt_version, 'durationMs', d.duration_ms,
        'usage', d.usage, 'cost', d.cost
      ) order by d.action_sequence) from public.ai_decisions d
      where d.hand_id = hands.id), '[]'::jsonb) else '[]'::jsonb end
  ) from public.hands
  where hands.game_id = p_game_id and hands.hand_number = p_hand_number;
$$;

revoke all on function public.get_hand_history(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_hand_history(uuid, integer) to service_role;

-- The two action RPCs created by the card-reveal migration still identify bot
-- winners using the legacy controller value. Their caller-provided reveal is
-- already engine-validated, so update the stored definitions' predicate.
do $$
declare function_oid oid; function_definition text;
begin
  for function_oid in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('apply_human_action_if_version')
  loop
    function_definition := pg_get_functiondef(function_oid);
    function_definition := replace(function_definition,
      'winner.controller = ''typesafe_ai''', 'winner.controller = ''bot''');
    execute function_definition;
  end loop;
end;
$$;
