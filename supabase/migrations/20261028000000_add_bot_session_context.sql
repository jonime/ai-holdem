-- Private, bounded inference history: all components use one statement snapshot.
-- Historical cards/ownership stay server-side; only validated aggregate facts leave it.
create function public.get_bot_session_context(p_game_id uuid, p_hand_number integer)
returns jsonb language sql stable security invoker set search_path = public as $$
  with selected as materialized (
    select h.* from public.hands h
    where h.game_id = p_game_id and h.hand_number < p_hand_number and h.status = 'complete'
    order by h.hand_number desc limit 50
  ), context_hands as (
    select h.*, false as historical from public.hands h
    where h.game_id = p_game_id and h.hand_number = p_hand_number
    union all select selected.*, true from selected
  ), projected as (
    select h.hand_number, h.historical, jsonb_build_object(
      'version', g.version, 'handNumber', h.hand_number, 'initialState', h.initial_state,
      'finalState', case when h.historical then h.final_state else null end,
      'actions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'sequence', a.sequence, 'action', a.action, 'amount', a.amount,
          'stateBefore', a.state_before,
          'forcedDeparture', a.action = 'fold' and exists (
            select 1 from jsonb_array_elements(
              coalesce(a.state_before #> '{config,players}', '[]'::jsonb) ||
              coalesce(a.state_after #> '{config,players}', '[]'::jsonb)
            ) player where player->>'id' =
              (select actor->>'playerId' from jsonb_array_elements(
                coalesce(a.state_before #> '{engineState,hand,players}', '[]'::jsonb)
              ) actor where actor->>'seat' = a.state_before #>> '{engineState,hand,currentActorSeat}')
              and player->>'leaving' = 'true'
          )
        ) order by a.sequence) from public.actions a
        where a.game_id = p_game_id and a.hand_id = h.id
      ), '[]'::jsonb)
    ) as payload from context_hands h join public.games g on g.id = h.game_id
  ) select jsonb_build_object(
    'gameId', g.id, 'version', g.version,
    'currentHand', (select payload from projected where not historical),
    'previousHands', coalesce((select jsonb_agg(payload order by hand_number) from projected where historical), '[]'::jsonb)
  ) from public.games g where g.id = p_game_id and g.hand_number = p_hand_number;
$$;
revoke all on function public.get_bot_session_context(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_bot_session_context(uuid, integer) to service_role;
