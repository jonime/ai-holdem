create or replace function public.get_hand_history(
  p_game_id uuid,
  p_hand_number integer
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'status', hands.status,
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
    ),
    'aiDecisions', case
      when hands.status = 'complete' then coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'actionSequence', ai_decisions.action_sequence,
              'state', ai_decisions.state,
              'legalActions', ai_decisions.legal_actions,
              'choice', ai_decisions.choice,
              'probabilities', ai_decisions.probabilities,
              'confidence', ai_decisions.confidence,
              'raiseSizeChoice', ai_decisions.raise_size_choice,
              'raiseSizeProbabilities', ai_decisions.raise_size_probabilities,
              'rawResponse', ai_decisions.raw_response
            )
            order by ai_decisions.action_sequence
          )
          from public.ai_decisions
          where ai_decisions.hand_id = hands.id
        ),
        '[]'::jsonb
      )
      else '[]'::jsonb
    end
  )
  from public.hands
  where hands.game_id = p_game_id
    and hands.hand_number = p_hand_number;
$$;

revoke all on function public.get_hand_history(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_hand_history(uuid, integer) to service_role;