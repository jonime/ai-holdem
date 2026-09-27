-- Persist only stable playstyle IDs. Prompt instructions remain server-owned.
alter table public.game_players
  add column bot_profile_id text
    check (bot_profile_id is null or bot_profile_id in ('balanced', 'tight', 'aggressive'));

update public.game_players
set bot_profile_id = 'balanced'
where bot_provider = 'openrouter';

alter table public.game_players
  drop constraint if exists game_players_bot_matches_controller;

alter table public.game_players
  add constraint game_players_bot_matches_controller check (
    (controller = 'human' and bot_id is null and bot_label is null
      and bot_provider is null and bot_model_id is null and ai_difficulty is null
      and bot_profile_id is null)
    or
    (controller = 'bot' and bot_id is not null and bot_label is not null
      and bot_provider is not null
      and ((bot_provider in ('typesafe', 'rules') and ai_difficulty is not null
            and bot_profile_id is null)
        or (bot_provider = 'openrouter' and ai_difficulty is null
            and bot_profile_id is not null)))
  );

alter table public.ai_decisions
  add column bot_profile_id text
    check (bot_profile_id is null or bot_profile_id in ('balanced', 'tight', 'aggressive'));

create or replace function public.create_game_session(
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
    bot_model_id, ai_difficulty, bot_profile_id, stack, engine_player_id, status,
    player_token, is_host, leaving
  )
  select created_game.id, players.seat, players.name, players.controller,
    players.bot_id, players.bot_label, players.bot_provider, players.bot_model_id,
    players.ai_difficulty, players.bot_profile_id, players.stack,
    players.engine_player_id, coalesce(players.status, 'open'),
    players.player_token, coalesce(players.is_host, false),
    coalesce(players.leaving, false)
  from jsonb_to_recordset(p_players) as players(
    seat integer, name text, controller text, bot_id text, bot_label text,
    bot_provider text, bot_model_id text, ai_difficulty text,
    bot_profile_id text, stack integer, engine_player_id text, status text,
    player_token text, is_host boolean, leaving boolean
  );
  if p_status <> 'waiting' then
    insert into public.hands (game_id, hand_number, status, initial_state)
    values (created_game.id, p_hand_number, 'playing', p_current_state);
  end if;
  return next created_game;
end;
$$;

create function public.set_ai_decision_bot_profile()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.bot_provider = 'openrouter' then
    select bot_profile_id into new.bot_profile_id
    from public.game_players where id = new.player_id;
  else
    new.bot_profile_id := null;
  end if;
  return new;
end;
$$;

create trigger ai_decisions_set_bot_profile
before insert on public.ai_decisions
for each row execute function public.set_ai_decision_bot_profile();

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
      'botModelId', game_players.bot_model_id,
      'botProfileId', game_players.bot_profile_id
    ) order by actions.sequence)
      from public.actions join public.game_players on game_players.id = actions.player_id
      where actions.hand_id = hands.id), '[]'::jsonb),
    'aiDecisions', case when hands.status = 'complete' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'actionSequence', d.action_sequence, 'state', d.state,
        'legalActions', d.legal_actions, 'choice', d.choice,
        'botId', d.bot_id, 'botLabel', d.bot_label,
        'botProvider', d.bot_provider, 'botModelId', d.bot_model_id,
        'botProfileId', d.bot_profile_id,
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
