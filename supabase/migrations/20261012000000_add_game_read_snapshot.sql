-- Apply before deploying the snapshot reader. Existing games need no backfill.
create index hand_card_reveals_game_hand_idx
  on public.hand_card_reveals (game_id, hand_number) include (engine_player_id);

create function public.get_game_read_snapshot(p_game_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'game', to_jsonb(g),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.seat)
      from public.game_players p where p.game_id = g.id
    ), '[]'::jsonb),
    'host_token', (select h.host_token from public.game_hosts h where h.game_id = g.id),
    'listing', (select to_jsonb(l) from public.game_listings l where l.game_id = g.id),
    'revealed_player_ids', coalesce((
      select jsonb_agg(r.engine_player_id order by r.engine_player_id)
      from public.hand_card_reveals r
      where r.game_id = g.id and r.hand_number = g.hand_number
    ), '[]'::jsonb)
  )
  from public.games g where g.id = p_game_id;
$$;

revoke all on function public.get_game_read_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.get_game_read_snapshot(uuid) to service_role;
