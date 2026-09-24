-- Bound get_game_feed to the most recent hands so long-running games don't
-- force ever-growing payloads/queries as more hands are played.
drop function if exists public.get_game_feed(uuid);

create or replace function public.get_game_feed(
  p_game_id uuid,
  p_hand_limit integer default 50
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  with recent_hands as (
    select hands.id, hands.hand_number, hands.status, hands.final_state
    from public.hands
    where hands.game_id = p_game_id
    order by hands.hand_number desc
    limit greatest(p_hand_limit, 0)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'handNumber', recent_hands.hand_number,
        'status', recent_hands.status,
        'finalState', recent_hands.final_state,
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
            where actions.hand_id = recent_hands.id
          ),
          '[]'::jsonb
        )
      )
      order by recent_hands.hand_number
    ),
    '[]'::jsonb
  )
  from recent_hands;
$$;

revoke all on function public.get_game_feed(uuid, integer) from public;
revoke all on function public.get_game_feed(uuid, integer) from anon, authenticated;
grant execute on function public.get_game_feed(uuid, integer) to service_role;
