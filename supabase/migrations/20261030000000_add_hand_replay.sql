-- One MVCC snapshot. Never grant historical private states to browser roles.
create function public.get_hand_replay(p_game_id uuid, p_hand_number integer)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'gameId', h.game_id, 'handNumber', h.hand_number, 'status', h.status,
    'initialState', h.initial_state, 'finalState', h.final_state,
    'actions', coalesce((select jsonb_agg(jsonb_build_object(
      'sequence', a.sequence, 'street', a.street, 'action', a.action,
      'amount', a.amount, 'actorSeat', p.seat, 'stateBefore', a.state_before
    ) order by a.sequence) from public.actions a
      join public.game_players p on p.id = a.player_id and p.game_id = h.game_id
      where a.game_id = h.game_id and a.hand_id = h.id), '[]'::jsonb),
    'revealedIds', coalesce((select jsonb_agg(r.engine_player_id)
      from public.hand_card_reveals r where r.game_id = h.game_id
      and r.hand_id = h.id and r.hand_number = h.hand_number), '[]'::jsonb)
  ) from public.hands h where h.game_id = p_game_id and h.hand_number = p_hand_number;
$$;
revoke all on function public.get_hand_replay(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_hand_replay(uuid, integer) to service_role;
