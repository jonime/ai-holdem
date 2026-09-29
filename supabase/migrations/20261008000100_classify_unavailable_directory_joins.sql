create or replace function public.join_public_game_if_version(
  p_game_id uuid,
  p_expected_version bigint,
  p_player_token text,
  p_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  locked_game public.games;
  chosen_seat integer;
  current_version bigint;
begin
  select * into locked_game from public.games where id = p_game_id for update;
  if not found then return jsonb_build_object('outcome', 'unavailable'); end if;

  select seat into chosen_seat from public.game_players
    where game_id = p_game_id and status = 'claimed' and player_token = p_player_token
    order by seat limit 1;
  if found then
    return jsonb_build_object(
      'outcome', 'joined', 'seat', chosen_seat,
      'version', locked_game.version, 'duplicate', true
    );
  end if;

  -- Eligibility is evaluated before the version so a lobby that started,
  -- became private, expired, or filled receives the safe unavailable result.
  if locked_game.status <> 'waiting'
    or exists (
      select 1 from public.game_hosts
      where game_id = p_game_id and host_token = p_player_token
    )
    or not exists (
      select 1 from public.game_listings
      where game_id = p_game_id and is_public
        and host_lease_expires_at > clock_timestamp()
    )
    or not exists (
      select 1 from public.game_players
      where game_id = p_game_id and status = 'open'
    ) then
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  if locked_game.version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'version', locked_game.version);
  end if;

  select seat into chosen_seat from public.game_players
    where game_id = p_game_id and status = 'open'
    order by seat limit 1 for update;
  if not found then return jsonb_build_object('outcome', 'unavailable'); end if;

  update public.game_players set
    status = 'claimed', controller = 'human',
    name = coalesce(nullif(left(btrim(coalesce(p_name, '')), 30), ''), 'Player ' || (chosen_seat + 1)),
    player_token = p_player_token, is_host = false, leaving = false,
    bot_id = null, bot_label = null, bot_provider = null, bot_model_id = null,
    ai_difficulty = null, bot_profile_id = null,
    engine_player_id = coalesce(engine_player_id, 'seat-' || p_game_id || '-' || chosen_seat)
  where game_id = p_game_id and seat = chosen_seat;

  update public.games set version = version + 1 where id = p_game_id
    returning version into current_version;
  return jsonb_build_object(
    'outcome', 'joined', 'seat', chosen_seat,
    'version', current_version, 'duplicate', false
  );
end;
$$;

revoke all on function public.join_public_game_if_version(uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.join_public_game_if_version(uuid, bigint, text, text)
  to service_role;
