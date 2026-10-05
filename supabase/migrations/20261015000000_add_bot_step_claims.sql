-- Apply before deploying claim-aware bot stepping; old instances must drain.
create table public.bot_step_claims (
  game_id uuid primary key references public.games(id) on delete cascade,
  expected_version bigint not null check (expected_version >= 0),
  actor_engine_id text not null,
  claim_token uuid not null,
  expires_at timestamptz not null
);
alter table public.bot_step_claims enable row level security;
revoke all on public.bot_step_claims from public, anon, authenticated;
grant all on public.bot_step_claims to service_role;

create function public.acquire_bot_step_claim(p_game_id uuid, p_expected_version bigint,
  p_actor_engine_id text, p_claim_token uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare g public.games; c public.bot_step_claims; db_now timestamptz;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found or g.version <> p_expected_version then
    return jsonb_build_object('outcome','conflict');
  end if;
  -- Engine details remain interpreted by the adapter; match the supplied actor
  -- against the durable bot seat as well as the version-scoped claim.
  if not exists(select 1 from public.game_players where game_id=p_game_id
    and engine_player_id=p_actor_engine_id and controller in ('bot','typesafe_ai')) then
    return jsonb_build_object('outcome','conflict');
  end if;
  db_now := clock_timestamp();
  select * into c from public.bot_step_claims where game_id=p_game_id;
  if found and c.expected_version=p_expected_version and c.actor_engine_id=p_actor_engine_id
    and c.expires_at > db_now then
    return jsonb_build_object('outcome','busy','expiresAt',c.expires_at,
      'retryAfterMs',ceil(extract(epoch from (c.expires_at-db_now))*1000));
  end if;
  insert into public.bot_step_claims values(p_game_id,p_expected_version,p_actor_engine_id,
    p_claim_token,db_now + interval '90 seconds')
  on conflict(game_id) do update set expected_version=excluded.expected_version,
    actor_engine_id=excluded.actor_engine_id, claim_token=excluded.claim_token, expires_at=excluded.expires_at;
  return jsonb_build_object('outcome','acquired');
end;
$$;

create function public.release_bot_step_claim(p_game_id uuid, p_claim_token uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.games where id=p_game_id for update;
  delete from public.bot_step_claims where game_id=p_game_id and claim_token=p_claim_token;
end;
$$;

create function public.commit_bot_action_with_claim(
  p_claim_token uuid,
  p_game_id uuid, p_expected_version bigint, p_player_engine_id text,
  p_current_state jsonb, p_status text, p_hand_number integer,
  p_state_schema_version integer, p_street text, p_action text, p_amount integer,
  p_state_before jsonb, p_state_after jsonb, p_hand_complete boolean,
  p_ai_state jsonb, p_legal_actions jsonb, p_choice text,
  p_bot_id text, p_bot_label text, p_bot_provider text, p_bot_model_id text,
  p_probabilities jsonb, p_confidence numeric, p_raise_size_choice text,
  p_raise_size_probabilities jsonb, p_raw_response jsonb,
  p_matched_rule text, p_prompt_version text, p_duration_ms integer,
  p_usage jsonb, p_cost numeric,
  p_auto_reveal_player_engine_id text default null,
  p_auto_reveal_reason text default null
)
returns setof public.games language plpgsql security invoker set search_path = public as $$
declare g public.games; committed_game public.games;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found or g.version <> p_expected_version then return; end if;
  if not exists(select 1 from public.bot_step_claims where game_id=p_game_id
    and expected_version=p_expected_version and actor_engine_id=p_player_engine_id
    and claim_token=p_claim_token and expires_at > clock_timestamp()) then
    raise exception using errcode='P0001', message='BOT_STEP_CLAIM_LOST';
  end if;
  select * into committed_game from public.apply_ai_action_if_version(
    p_game_id, p_expected_version, p_player_engine_id, p_current_state, p_status, p_hand_number, p_state_schema_version, p_street, p_action, p_amount, p_state_before, p_state_after, p_hand_complete, p_ai_state, p_legal_actions, p_choice, p_bot_id, p_bot_label, p_bot_provider, p_bot_model_id, p_probabilities, p_confidence, p_raise_size_choice, p_raise_size_probabilities, p_raw_response, p_matched_rule, p_prompt_version, p_duration_ms, p_usage, p_cost, p_auto_reveal_player_engine_id, p_auto_reveal_reason
  );
  if not found then return; end if;
  delete from public.bot_step_claims where game_id=p_game_id and claim_token=p_claim_token;
  return next committed_game;
end;
$$;
revoke all on function public.commit_bot_action_with_claim(uuid,   uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, text, text, text, text, jsonb,
  numeric, text, jsonb, jsonb, text, text, integer, jsonb, numeric, text, text) from public, anon, authenticated;
grant execute on function public.commit_bot_action_with_claim(uuid,   uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, text, text, text, text, jsonb,
  numeric, text, jsonb, jsonb, text, text, integer, jsonb, numeric, text, text) to service_role;

create function public.commit_bot_departure_with_claim(
  p_claim_token uuid,
  p_game_id uuid, p_expected_version bigint, p_player_engine_id text,
  p_current_state jsonb, p_status text, p_hand_number integer,
  p_state_schema_version integer, p_street text, p_action text, p_amount integer,
  p_state_before jsonb, p_state_after jsonb, p_hand_complete boolean,
  p_ai_state jsonb, p_legal_actions jsonb, p_choice text,
  p_bot_id text, p_bot_label text, p_bot_provider text, p_bot_model_id text,
  p_probabilities jsonb, p_confidence numeric, p_raise_size_choice text,
  p_raise_size_probabilities jsonb, p_raw_response jsonb,
  p_matched_rule text, p_prompt_version text, p_duration_ms integer,
  p_usage jsonb, p_cost numeric,
  p_auto_reveal_player_engine_id text default null,
  p_auto_reveal_reason text default null
)
returns setof public.games language plpgsql security invoker set search_path = public as $$
declare g public.games; committed_game public.games;
begin
  select * into g from public.games where id=p_game_id for update;
  if not found or g.version <> p_expected_version then return; end if;
  if not exists(select 1 from public.bot_step_claims where game_id=p_game_id
    and expected_version=p_expected_version and actor_engine_id=p_player_engine_id
    and claim_token=p_claim_token and expires_at > clock_timestamp()) then
    raise exception using errcode='P0001', message='BOT_STEP_CLAIM_LOST';
  end if;
  select * into committed_game from public.apply_ai_action_and_leave_if_version(
    p_game_id, p_expected_version, p_player_engine_id, p_current_state, p_status, p_hand_number, p_state_schema_version, p_street, p_action, p_amount, p_state_before, p_state_after, p_hand_complete, p_ai_state, p_legal_actions, p_choice, p_bot_id, p_bot_label, p_bot_provider, p_bot_model_id, p_probabilities, p_confidence, p_raise_size_choice, p_raise_size_probabilities, p_raw_response, p_matched_rule, p_prompt_version, p_duration_ms, p_usage, p_cost, p_auto_reveal_player_engine_id, p_auto_reveal_reason
  );
  if not found then return; end if;
  delete from public.bot_step_claims where game_id=p_game_id and claim_token=p_claim_token;
  return next committed_game;
end;
$$;
revoke all on function public.commit_bot_departure_with_claim(uuid,   uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, text, text, text, text, jsonb,
  numeric, text, jsonb, jsonb, text, text, integer, jsonb, numeric, text, text) from public, anon, authenticated;
grant execute on function public.commit_bot_departure_with_claim(uuid,   uuid, bigint, text, jsonb, text, integer, integer, text, text, integer,
  jsonb, jsonb, boolean, jsonb, jsonb, text, text, text, text, text, jsonb,
  numeric, text, jsonb, jsonb, text, text, integer, jsonb, numeric, text, text) to service_role;

revoke all on function public.acquire_bot_step_claim(uuid,bigint,text,uuid) from public,anon,authenticated;
revoke all on function public.release_bot_step_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.acquire_bot_step_claim(uuid,bigint,text,uuid) to service_role;
grant execute on function public.release_bot_step_claim(uuid,uuid) to service_role;
