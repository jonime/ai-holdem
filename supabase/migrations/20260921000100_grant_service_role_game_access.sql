grant usage on schema public to service_role;

grant select, insert, update, delete on table public.games to service_role;
grant select, insert, update, delete on table public.game_players to service_role;
grant select, insert, update, delete on table public.hands to service_role;
grant select, insert, update, delete on table public.actions to service_role;
grant select, insert, update, delete on table public.ai_decisions to service_role;

grant execute on function public.update_game_state_if_version(
  uuid,
  bigint,
  jsonb,
  text,
  integer,
  integer
) to service_role;