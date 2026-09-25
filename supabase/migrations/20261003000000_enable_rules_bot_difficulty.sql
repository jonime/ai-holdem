-- Backfill the deterministic rules bot difficulty to the current medium default
-- and keep the assignment check aligned with the provider capability matrix.

update public.game_players
set ai_difficulty = 'medium'
where bot_provider = 'rules' and ai_difficulty is null;

alter table public.game_players
  drop constraint if exists game_players_bot_matches_controller;

alter table public.game_players
  add constraint game_players_bot_matches_controller check (
    (controller = 'human' and bot_id is null and bot_label is null
      and bot_provider is null and bot_model_id is null and ai_difficulty is null)
    or
    (controller = 'bot' and bot_id is not null and bot_label is not null
      and bot_provider is not null
      and ((bot_provider in ('typesafe', 'rules') and ai_difficulty is not null)
        or (bot_provider = 'openrouter' and ai_difficulty is null)))
  );
