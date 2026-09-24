-- Simplified, whole-game action feed for the player-facing history panel.
-- Unlike get_hand_history (one hand, includes AI inspection detail for
-- debugging), this returns every hand's actions plus the persisted final
-- engine state so callers can derive board cards and hand winners.
create or replace function public.get_game_feed(
  p_game_id uuid
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'handNumber', hands.hand_number,
        'status', hands.status,
        'finalState', hands.final_state,
        'actions', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'sequence', actions.sequence,
                'street', actions.street,
                'action', actions.action,
                'amount', actions.amount,
                'player', game_players.name,
                'controller', game_players.controller
              )
              order by actions.sequence
            )
            from public.actions
            join public.game_players on game_players.id = actions.player_id
            where actions.hand_id = hands.id
          ),
          '[]'::jsonb
        )
      )
      order by hands.hand_number
    ),
    '[]'::jsonb
  )
  from public.hands
  where hands.game_id = p_game_id;
$$;

revoke all on function public.get_game_feed(uuid) from public;
revoke all on function public.get_game_feed(uuid) from anon, authenticated;
grant execute on function public.get_game_feed(uuid) to service_role;
