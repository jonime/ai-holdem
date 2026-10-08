-- Deploy before application code. Old rows stay Off; no read initializes a timer.
alter table public.games
  add column human_turn_seconds integer check (human_turn_seconds in (30,60,90)),
  add column human_timer_hand integer,
  add column human_timer_enabled boolean not null default false,
  add column turn_decision_id uuid,
  add column turn_actor_engine_id text,
  add column turn_hand_number integer,
  add column turn_deadline timestamptz,
  add constraint complete_turn_timer check (
    (turn_decision_id is null and turn_actor_engine_id is null and turn_hand_number is null and turn_deadline is null)
    or (turn_decision_id is not null and turn_actor_engine_id is not null and turn_hand_number is not null and turn_deadline is not null
      and human_timer_enabled and human_turn_seconds is not null and turn_hand_number=human_timer_hand)
  );

-- The adapter supplies opaque actionable-actor facts; SQL never chooses an action.
-- Fence legacy writers even during solo hands, so a later multiplayer hand cannot
-- start without a transition. Unrelated versions retain their original deadline.
create function public.maintain_human_turn_timer() returns trigger
language plpgsql security invoker set search_path=public as $$
declare transition jsonb; changed boolean;
begin
  if tg_op='INSERT' then
    new.human_turn_seconds := (new.current_state #>> '{config,humanTurnSeconds}')::integer;
    return new;
  end if;
  if old.status='waiting' then
    if new.current_state #> '{config}' ? 'humanTurnSeconds' then
      new.human_turn_seconds := (new.current_state #>> '{config,humanTurnSeconds}')::integer;
    end if;
  elsif new.human_turn_seconds is distinct from old.human_turn_seconds then
    raise exception 'Timer settings are frozen outside the lobby';
  end if;
  changed := new.current_state->'engineState' is distinct from old.current_state->'engineState'
    and (old.status='playing' or new.status='playing');
  if changed and new.human_turn_seconds is not null then
    if current_setting('poker.timer_game',true) is distinct from new.id::text then
      raise exception 'TURN_TRANSITION_REQUIRED';
    end if;
    transition := nullif(current_setting('poker.timer_transition',true),'')::jsonb;
    if transition is null or (transition->>'handNumber')::integer is distinct from new.hand_number
      or not (transition ? 'actorEngineId') or jsonb_typeof(transition->'multiplayer') <> 'boolean' then
      raise exception 'TURN_TRANSITION_REQUIRED';
    end if;
    if old.hand_number is distinct from new.hand_number or old.status='waiting' then
      new.human_timer_hand := new.hand_number;
      new.human_timer_enabled := (transition->>'multiplayer')::boolean;
    end if;
    if new.human_timer_enabled and new.status='playing' and transition->>'actorEngineId' is not null then
      new.turn_decision_id := gen_random_uuid();
      new.turn_actor_engine_id := transition->>'actorEngineId';
      new.turn_hand_number := new.hand_number;
      new.turn_deadline := clock_timestamp()+make_interval(secs=>new.human_turn_seconds);
    else
      new.turn_decision_id := null; new.turn_actor_engine_id := null;
      new.turn_hand_number := null; new.turn_deadline := null;
    end if;
  end if;
  return new;
end; $$;
create trigger maintain_human_turn_timer before insert or update on public.games
for each row execute function public.maintain_human_turn_timer();
revoke all on function public.maintain_human_turn_timer() from public,anon,authenticated;

-- Shared transaction boundary for the existing atomic mutation routines. Only a
-- fixed allowlist of public routines is callable. Named arguments retain defaults
-- and are decoded using the installed routine's declared SQL types.
create function public.commit_with_turn_timer(
  p_operation text, p_arguments jsonb, p_transition jsonb,
  p_decision_id uuid default null, p_driver_token text default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  g public.games; game_id uuid; routine record; argument record;
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
  game_id := (p_arguments->>'p_game_id')::uuid;
  if game_id is not null then
    select * into g from public.games where id=game_id for update;
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
  perform set_config('poker.timer_game',coalesce(game_id::text,''),true);
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
revoke all on function public.commit_with_turn_timer(text,jsonb,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.commit_with_turn_timer(text,jsonb,jsonb,uuid,text) to service_role;

-- Keep a single consistent snapshot, including the database clock.
create or replace function public.get_game_read_snapshot(p_game_id uuid)
returns jsonb language sql stable security invoker set search_path=public as $$
  select jsonb_build_object(
    'game',to_jsonb(g)||jsonb_build_object('server_time',statement_timestamp()),
    'assignments',coalesce((select jsonb_agg(to_jsonb(p) order by p.seat) from public.game_players p where p.game_id=g.id),'[]'::jsonb),
    'host_token',(select h.host_token from public.game_hosts h where h.game_id=g.id),
    'listing',(select to_jsonb(l) from public.game_listings l where l.game_id=g.id),
    'revealed_player_ids',coalesce((select jsonb_agg(r.engine_player_id order by r.engine_player_id) from public.hand_card_reveals r
      where r.game_id=g.id and r.hand_number=g.hand_number),'[]'::jsonb))
  from public.games g where g.id=p_game_id;
$$;

-- Preserve visitor filtering, leases, ordering and paging in the existing query.
alter function public.list_public_games(text,timestamptz,uuid,integer) rename to list_public_games_before_timers;
create function public.list_public_games(p_player_token text,p_cursor_published_at timestamptz default null,
  p_cursor_game_id uuid default null,p_limit integer default 50)
returns table(game_id uuid,title text,version bigint,occupied_seats bigint,total_seats bigint,
  human_count bigint,bot_count bigint,small_blind integer,big_blind integer,starting_stack integer,
  published_at timestamptz,human_turn_seconds integer)
language sql security invoker set search_path=public as $$
  select d.*,g.human_turn_seconds from public.list_public_games_before_timers($1,$2,$3,$4) d
    join public.games g on g.id=d.game_id order by d.published_at desc,d.game_id desc;
$$;
revoke all on function public.list_public_games(text,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_public_games(text,timestamptz,uuid,integer) to service_role;
