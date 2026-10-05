-- Private inference history. One statement gives a consistent version and hand.
-- No joins on mutable player names/seats and no AI audit/provider responses.
create function public.get_bot_hand_context(p_game_id uuid, p_hand_number integer)
returns jsonb language sql security invoker set search_path = public as $$
  select jsonb_build_object(
    'version', g.version, 'handNumber', h.hand_number,
    'initialState', h.initial_state,
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sequence', a.sequence, 'action', a.action, 'amount', a.amount,
        'stateBefore', a.state_before
      ) order by a.sequence)
      from public.actions a
      where a.game_id = p_game_id and a.hand_id = h.id
    ), '[]'::jsonb)
  ) from public.hands h join public.games g on g.id = h.game_id
  where h.game_id = p_game_id and h.hand_number = p_hand_number;
$$;
revoke all on function public.get_bot_hand_context(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_bot_hand_context(uuid, integer) to service_role;
