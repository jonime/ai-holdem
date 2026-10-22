-- Private history only. The first page fixes the completed-hand boundary in one statement.
create function public.get_personal_results_page(
  p_game_id uuid, p_after_hand integer default 0, p_through_hand integer default null
) returns jsonb language sql stable security invoker set search_path = public as $$
  with boundary as (
    select coalesce(p_through_hand, greatest(
      coalesce((select max(h.hand_number) from public.hands h where h.game_id = p_game_id and h.status = 'complete'), 0),
      greatest(0, g.hand_number - case when g.status = 'complete' then 0 else 1 end)
    )) as upper_hand from public.games g where g.id = p_game_id
  ), page as (
    select h.hand_number, h.initial_state, h.final_state
    from public.hands h cross join boundary b
    where h.game_id = p_game_id and h.status = 'complete'
      and h.hand_number > p_after_hand and h.hand_number <= b.upper_hand
    order by h.hand_number limit 100
  )
  select jsonb_build_object('throughHand', b.upper_hand, 'hands', coalesce((
    select jsonb_agg(jsonb_build_object('handNumber', p.hand_number,
      'initialState', p.initial_state, 'finalState', p.final_state) order by p.hand_number) from page p
  ), '[]'::jsonb)) from boundary b;
$$;
revoke all on function public.get_personal_results_page(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.get_personal_results_page(uuid, integer, integer) to service_role;
