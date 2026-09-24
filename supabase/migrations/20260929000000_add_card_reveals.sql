alter table public.games
  add column bots_show_uncontested_wins boolean not null default false;

create table public.hand_card_reveals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  hand_id uuid not null references public.hands(id) on delete cascade,
  player_id uuid not null references public.game_players(id) on delete restrict,
  hand_number integer not null check (hand_number > 0),
  engine_player_id text not null,
  reason text not null check (reason in ('voluntary', 'bot_uncontested')),
  created_at timestamptz not null default now(),
  unique (hand_id, player_id)
);

alter table public.hand_card_reveals enable row level security;
revoke all on table public.hand_card_reveals from public, anon, authenticated;
grant select, insert on table public.hand_card_reveals to service_role;

DROP FUNCTION IF EXISTS public.update_table_settings_if_version(
  uuid, bigint, integer, integer, integer, integer, jsonb, integer
);
CREATE FUNCTION public.update_table_settings_if_version(
  p_game_id uuid,
  p_expected_version bigint,
  p_seat_count integer,
  p_small_blind integer,
  p_big_blind integer,
  p_starting_stack integer,
  p_bots_show_uncontested_wins boolean,
  p_current_state jsonb,
  p_state_schema_version integer
)
RETURNS SETOF public.games
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  locked_game public.games;
  highest_occupied_seat integer;
BEGIN
  IF p_seat_count < 2 OR p_seat_count > 6 THEN
    RAISE EXCEPTION 'seatCount must be an integer from 2 through 6';
  END IF;
  IF p_small_blind < 1 THEN RAISE EXCEPTION 'smallBlind must be positive'; END IF;
  IF p_big_blind <= p_small_blind THEN
    RAISE EXCEPTION 'bigBlind must be greater than smallBlind';
  END IF;
  IF p_starting_stack < p_big_blind THEN
    RAISE EXCEPTION 'startingStack must be at least as large as bigBlind';
  END IF;

  SELECT * INTO locked_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR locked_game.status <> 'waiting'
    OR locked_game.version <> p_expected_version THEN
    RETURN;
  END IF;

  SELECT max(seat) INTO highest_occupied_seat
  FROM public.game_players
  WHERE game_id = p_game_id AND status <> 'open';
  IF highest_occupied_seat IS NOT NULL AND highest_occupied_seat >= p_seat_count THEN
    RAISE EXCEPTION 'Cannot shrink seat count below an occupied seat';
  END IF;

  DELETE FROM public.game_players
  WHERE game_id = p_game_id AND seat >= p_seat_count AND status = 'open';
  INSERT INTO public.game_players (game_id, seat, name, controller, stack, status)
  SELECT p_game_id, seat_number, 'Seat ' || (seat_number + 1), 'human',
         p_starting_stack, 'open'
  FROM generate_series(0, p_seat_count - 1) AS seat_number
  WHERE NOT EXISTS (
    SELECT 1 FROM public.game_players
    WHERE game_players.game_id = p_game_id AND game_players.seat = seat_number
  );
  UPDATE public.game_players SET stack = p_starting_stack WHERE game_id = p_game_id;

  RETURN QUERY
  UPDATE public.games
  SET current_state = p_current_state,
      state_schema_version = p_state_schema_version,
      bots_show_uncontested_wins = p_bots_show_uncontested_wins,
      version = version + 1
  WHERE id = p_game_id
  RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.update_table_settings_if_version(
  uuid, bigint, integer, integer, integer, integer, boolean, jsonb, integer
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_table_settings_if_version(
  uuid, bigint, integer, integer, integer, integer, boolean, jsonb, integer
) TO service_role;

DROP FUNCTION IF EXISTS public.apply_human_action_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean
);
CREATE FUNCTION public.apply_human_action_if_version(
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
  SELECT id, status, current_state, state_schema_version, hand_number,
    version, created_at, updated_at, min_seats_to_start, bots_show_uncontested_wins
  FROM updated_game;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_human_action_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, text, text
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_human_action_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, text, text
) TO service_role;

DROP FUNCTION IF EXISTS public.apply_ai_action_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, jsonb, numeric, text, jsonb, jsonb
);
CREATE FUNCTION public.apply_ai_action_if_version(
  p_game_id uuid, p_expected_version bigint, p_player_engine_id text,
  p_current_state jsonb, p_status text, p_hand_number integer,
  p_state_schema_version integer, p_street text, p_action text, p_amount integer,
  p_state_before jsonb, p_state_after jsonb, p_hand_complete boolean,
  p_ai_state jsonb, p_legal_actions jsonb, p_choice text,
  p_probabilities jsonb, p_confidence numeric, p_raise_size_choice text,
  p_raise_size_probabilities jsonb, p_raw_response jsonb,
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
      AND game_players.controller = 'typesafe_ai'
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
    FROM updated_game RETURNING hand_id, player_id, sequence
  ), inserted_decision AS (
    INSERT INTO public.ai_decisions (
      game_id, hand_id, player_id, action_sequence, state, legal_actions,
      choice, probabilities, confidence, raise_size_choice,
      raise_size_probabilities, raw_response
    )
    SELECT p_game_id, hand_id, player_id, sequence, p_ai_state,
      p_legal_actions, p_choice, p_probabilities, p_confidence,
      p_raise_size_choice, p_raise_size_probabilities, p_raw_response
    FROM inserted_action RETURNING hand_id
  ), completed_hand AS (
    UPDATE public.hands SET status = 'complete', final_state = p_state_after,
      completed_at = now()
    WHERE p_hand_complete AND id IN (SELECT hand_id FROM inserted_decision)
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
  SELECT id, status, current_state, state_schema_version, hand_number,
    version, created_at, updated_at, min_seats_to_start, bots_show_uncontested_wins
  FROM updated_game;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_ai_action_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, jsonb, numeric, text, jsonb, jsonb,
  text, text
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ai_action_if_version(
  uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, jsonb, numeric, text, jsonb, jsonb,
  text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.reveal_human_cards_if_version(
  p_game_id uuid,
  p_hand_number integer,
  p_expected_version bigint,
  p_player_token text
)
RETURNS SETOF public.games
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  locked_game public.games;
  target_hand public.hands;
  target_player public.game_players;
BEGIN
  SELECT * INTO locked_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO target_hand FROM public.hands
  WHERE game_id = p_game_id AND hand_number = p_hand_number
    AND status = 'complete'
    AND final_state #>> '{engineState,hand,completionReason}' = 'fold';
  SELECT * INTO target_player FROM public.game_players
  WHERE game_id = p_game_id AND player_token = p_player_token
    AND controller = 'human' AND status = 'claimed';
  IF NOT FOUND OR target_hand.id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.hand_card_reveals
    WHERE hand_id = target_hand.id AND player_id = target_player.id
  ) THEN
    RETURN QUERY SELECT * FROM public.games WHERE id = p_game_id;
    RETURN;
  END IF;

  IF locked_game.version <> p_expected_version THEN RETURN; END IF;
  INSERT INTO public.hand_card_reveals (
    game_id, hand_id, player_id, hand_number, engine_player_id, reason
  )
  VALUES (
    p_game_id, target_hand.id, target_player.id, p_hand_number,
    target_player.engine_player_id, 'voluntary'
  );
  RETURN QUERY UPDATE public.games SET version = version + 1
    WHERE id = p_game_id RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.reveal_human_cards_if_version(
  uuid, integer, bigint, text
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_human_cards_if_version(
  uuid, integer, bigint, text
) TO service_role;
