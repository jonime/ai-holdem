update public.game_players
set name = 'Player ' || (seat + 1)::text
where controller = 'human'
  and name = 'You';

update public.games
set current_state = jsonb_set(
  current_state,
  '{config,players}',
  (
    select jsonb_agg(
      case
        when player->>'controller' = 'human' and player->>'name' = 'You'
          then jsonb_set(
            player,
            '{name}',
            to_jsonb('Player ' || (((player->>'seat')::integer) + 1)::text)
          )
        else player
      end
      order by ordinal
    )
    from jsonb_array_elements(current_state->'config'->'players')
      with ordinality as entries(player, ordinal)
  ),
  false
)
where jsonb_typeof(current_state->'config'->'players') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(current_state->'config'->'players')
      as entries(player)
    where player->>'controller' = 'human'
      and player->>'name' = 'You'
  );
