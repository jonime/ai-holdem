-- Expand historical action return projections to the current games row type.
CREATE OR REPLACE FUNCTION public.apply_human_action_before_departures(
  p_game_id uuid, p_expected_version bigint, p_player_engine_id text,
  p_current_state jsonb, p_status text, p_hand_number integer,
  p_state_schema_version integer, p_street text, p_action text, p_amount integer,
  p_state_before jsonb, p_state_after jsonb, p_hand_complete boolean,
  p_auto_reveal_player_engine_id text DEFAULT NULL,
  p_auto_reveal_reason text DEFAULT NULL
)
RETURNS SETOF public.games
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH eligible_action AS (
    SELECT game_players.id AS player_id, hands.id AS hand_id
    FROM public.game_players
    JOIN public.hands ON hands.game_id = game_players.game_id
      AND hands.hand_number = p_hand_number AND hands.status = 'playing'
    WHERE game_players.game_id = p_game_id
      AND game_players.engine_player_id = p_player_engine_id
      AND game_players.controller = 'human'
  ), updated_game AS (
    UPDATE public.games
    SET current_state = p_current_state, status = p_status,
        hand_number = p_hand_number, state_schema_version = p_state_schema_version,
        version = version + 1
    FROM eligible_action
    WHERE games.id = p_game_id AND games.version = p_expected_version
    RETURNING games.*, eligible_action.player_id, eligible_action.hand_id
  ), inserted_action AS (
    INSERT INTO public.actions (
      game_id, hand_id, player_id, sequence, street, action, amount,
      state_before, state_after
    )
    SELECT id, hand_id, player_id,
      (SELECT coalesce(max(sequence), 0) + 1 FROM public.actions
       WHERE hand_id = updated_game.hand_id),
      p_street, p_action, p_amount, p_state_before, p_state_after
    FROM updated_game RETURNING hand_id
  ), completed_hand AS (
    UPDATE public.hands SET status = 'complete', final_state = p_state_after,
      completed_at = now()
    WHERE p_hand_complete AND id IN (SELECT hand_id FROM inserted_action)
    RETURNING id
  ), auto_reveal AS (
    INSERT INTO public.hand_card_reveals (
      game_id, hand_id, player_id, hand_number, engine_player_id, reason
    )
    SELECT p_game_id, completed_hand.id, winner.id, p_hand_number,
      p_auto_reveal_player_engine_id, p_auto_reveal_reason
    FROM completed_hand
    JOIN public.games g ON g.id = p_game_id AND g.bots_show_uncontested_wins
    JOIN public.game_players winner ON winner.game_id = p_game_id
      AND winner.engine_player_id = p_auto_reveal_player_engine_id
      AND winner.controller = 'typesafe_ai'
    WHERE p_auto_reveal_player_engine_id IS NOT NULL
      AND p_auto_reveal_reason = 'bot_uncontested'
    ON CONFLICT (hand_id, player_id) DO NOTHING
    RETURNING id
  )
  select (jsonb_populate_record(null::public.games,to_jsonb(updated_game))).* from updated_game;
END;
$$;

create or replace function public.apply_ai_action_if_version(
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
  ), completed_hand as (
    update public.hands set status = 'complete', final_state = p_state_after,
      completed_at = now()
    where p_hand_complete and id in (select hand_id from inserted_action)
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
  select (jsonb_populate_record(null::public.games,to_jsonb(updated_game))).* from updated_game;
end;
$$;


