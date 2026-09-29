create or replace function public.list_public_game_exclusions(
  p_player_token text
)
returns table (game_id uuid)
language sql
security invoker
set search_path = public
as $$
  select h.game_id
  from public.game_hosts h
  where h.host_token = p_player_token
  union
  select p.game_id
  from public.game_players p
  where p.status = 'claimed'
    and p.player_token = p_player_token;
$$;

revoke all on function public.list_public_game_exclusions(text)
  from public, anon, authenticated;
grant execute on function public.list_public_game_exclusions(text)
  to service_role;
