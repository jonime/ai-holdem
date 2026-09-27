-- Present model-backed seats as provider-neutral LLM bots. OpenRouter remains
-- the configured transport, but is no longer part of the persisted bot type.

alter table public.game_players
  drop constraint if exists game_players_bot_matches_controller,
  drop constraint if exists game_players_bot_provider_check;

alter table public.ai_decisions
  drop constraint if exists ai_decisions_bot_provider_check;

update public.game_players
set bot_provider = 'llm'
where bot_provider = 'openrouter';

update public.ai_decisions
set bot_provider = 'llm'
where bot_provider = 'openrouter';

alter table public.game_players
  add constraint game_players_bot_provider_check
    check (bot_provider is null or bot_provider in ('typesafe', 'llm', 'rules')),
  add constraint game_players_bot_matches_controller check (
    (controller = 'human' and bot_id is null and bot_label is null
      and bot_provider is null and bot_model_id is null and ai_difficulty is null
      and bot_profile_id is null)
    or
    (controller = 'bot' and bot_id is not null and bot_label is not null
      and bot_provider is not null
      and ((bot_provider in ('typesafe', 'rules') and ai_difficulty is not null
            and bot_profile_id is null)
        or (bot_provider = 'llm' and ai_difficulty is null
            and bot_profile_id is not null)))
  );

alter table public.ai_decisions
  add constraint ai_decisions_bot_provider_check
    check (bot_provider in ('typesafe', 'llm', 'rules'));

create or replace function public.set_ai_decision_bot_profile()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.bot_provider = 'llm' then
    select bot_profile_id into new.bot_profile_id
    from public.game_players where id = new.player_id;
  else
    new.bot_profile_id := null;
  end if;
  return new;
end;
$$;
