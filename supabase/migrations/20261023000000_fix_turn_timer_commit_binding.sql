-- Keep timer transaction variables distinct from persisted column names.
create or replace function public.commit_with_turn_timer(
  p_operation text, p_arguments jsonb, p_transition jsonb,
  p_decision_id uuid default null, p_driver_token text default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  g public.games; target_game_id uuid; routine record; argument record;
  columns text := ''; bindings text := ''; result jsonb; row_result boolean;
  previous_game text; previous_transition text;
begin
  if p_operation <> all(array['create_game_session','start_game_if_version','start_next_hand_if_version',
    'update_table_settings_if_version','update_seat_count_if_version','apply_human_action_if_version',
    'apply_ai_action_if_version','apply_ai_action_and_leave_if_version','commit_bot_action_with_claim',
    'commit_bot_departure_with_claim','advance_departure_if_version','depart_game_seat_if_version',
    'remove_game_if_version','reveal_human_cards_if_version','set_game_publication_if_version']) then
    raise exception 'Unsupported timer operation';
  end if;
  target_game_id := (p_arguments->>'p_game_id')::uuid;
  if target_game_id is not null then
    select * into g from public.games where id=target_game_id for update;
    if found and p_decision_id is not null then
      if p_driver_token is null or not (
        exists(select 1 from public.game_hosts where game_id=g.id and host_token=p_driver_token)
        or exists(select 1 from public.game_players where game_id=g.id and controller='human' and status='claimed' and player_token=p_driver_token)
      ) then raise exception 'TURN_FORBIDDEN'; end if;
      if g.version is distinct from (p_arguments->>'p_expected_version')::bigint
        or g.turn_decision_id is distinct from p_decision_id
        or g.turn_actor_engine_id is distinct from p_arguments->>'p_player_engine_id'
        or g.turn_hand_number is distinct from (p_arguments->>'p_hand_number')::integer
        or p_operation <> 'apply_human_action_if_version'
        or p_arguments->>'p_action' not in ('check','fold') then
        return '[]'::jsonb;
      end if;
      if not exists(select 1 from public.game_players where game_id=g.id and engine_player_id=g.turn_actor_engine_id
        and status='claimed' and controller='human' and (not leaving or p_arguments->>'p_action'='fold')) then
        return '[]'::jsonb;
      end if;
      if clock_timestamp() < g.turn_deadline then
        return jsonb_build_object('timerError','TURN_NOT_EXPIRED','retryAfterMs',greatest(1,ceil(extract(epoch from (g.turn_deadline-clock_timestamp()))*1000)));
      end if;
    elsif found and p_operation='apply_human_action_if_version'
      and g.version=(p_arguments->>'p_expected_version')::bigint
      and g.turn_actor_engine_id=p_arguments->>'p_player_engine_id'
      and clock_timestamp() >= g.turn_deadline
      and not exists(select 1 from public.game_players where game_id=g.id and engine_player_id=g.turn_actor_engine_id and leaving) then
      return jsonb_build_object('timerError','TURN_EXPIRED');
    end if;
  end if;
  select p.* into strict routine from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=p_operation
      and not exists(select 1 from jsonb_object_keys(p_arguments) key where not key=any(p.proargnames))
      and not exists(select 1 from generate_series(1,p.pronargs-p.pronargdefaults) i where not p_arguments ? p.proargnames[i]);
  for argument in select routine.proargnames[i] name, format_type(routine.proargtypes[i-1],null) kind
    from generate_series(1,routine.pronargs) i where p_arguments ? routine.proargnames[i]
  loop
    columns := columns || case when columns='' then '' else ',' end || format('%I %s',argument.name,argument.kind);
    bindings := bindings || case when bindings='' then '' else ',' end || format('%I=>a.%I',argument.name,argument.name);
  end loop;
  previous_game := current_setting('poker.timer_game',true);
  previous_transition := current_setting('poker.timer_transition',true);
  perform set_config('poker.timer_game',coalesce(target_game_id::text,''),true);
  perform set_config('poker.timer_transition',coalesce(p_transition::text,''),true);
  row_result := routine.proretset;
  if row_result then
    execute format('select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object(''server_time'',clock_timestamp())),''[]''::jsonb) from jsonb_to_record($1) a(%s) cross join lateral public.%I(%s) r',columns,p_operation,bindings) into result using p_arguments;
  else
    execute format('select public.%I(%s) from jsonb_to_record($1) a(%s)',p_operation,bindings,columns) into result using p_arguments;
  end if;
  perform set_config('poker.timer_game',coalesce(previous_game,''),true);
  perform set_config('poker.timer_transition',coalesce(previous_transition,''),true);
  return result;
end; $$;
