-- Add Eevo without changing existing Jev seats or immutable history.
alter table public.game_players
  drop constraint game_players_bot_provider_check,
  drop constraint game_players_bot_matches_controller;
alter table public.game_players
  add constraint game_players_bot_provider_check
    check (bot_provider is null or bot_provider in ('typesafe', 'eevo', 'llm', 'rules')),
  add constraint game_players_bot_matches_controller check (
    (controller = 'human' and bot_id is null and bot_label is null
      and bot_provider is null and bot_model_id is null and ai_difficulty is null
      and bot_profile_id is null)
    or
    (controller = 'bot' and bot_id is not null and bot_label is not null
      and bot_provider is not null
      and ((bot_provider in ('typesafe', 'eevo', 'rules') and ai_difficulty is not null
            and bot_profile_id is null)
        or (bot_provider = 'llm' and ai_difficulty is null
            and bot_profile_id is not null)))
  );
