create table public.game_listings (
  game_id uuid primary key references public.games(id) on delete cascade,
  is_public boolean not null default false,
  title text check (title is null or char_length(title) between 1 and 60),
  published_at timestamptz not null default now(),
  host_lease_expires_at timestamptz not null default now()
);

alter table public.game_listings enable row level security;
revoke all on table public.game_listings from public, anon, authenticated;
grant select, insert, update on table public.game_listings to service_role;

create index game_listings_public_directory_idx
  on public.game_listings (published_at desc, game_id desc)
  where is_public;

create or replace function public.list_public_games(
  p_player_token text,
  p_cursor_published_at timestamptz default null,
  p_cursor_game_id uuid default null,
  p_limit integer default 50
)
returns table (
  game_id uuid,
  title text,
  version bigint,
  occupied_seats bigint,
  total_seats bigint,
  human_count bigint,
  bot_count bigint,
  small_blind integer,
  big_blind integer,
  starting_stack integer,
  published_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  select
    g.id,
    l.title,
    g.version,
    count(*) filter (where p.status <> 'open'),
    count(*),
    count(*) filter (where p.status = 'claimed' and not p.leaving),
    count(*) filter (where p.status = 'bot' and not p.leaving),
    (g.current_state #>> '{config,smallBlind}')::integer,
    (g.current_state #>> '{config,bigBlind}')::integer,
    coalesce(
      (g.current_state #>> '{config,startingStack}')::integer,
      (g.current_state #>> '{config,players,0,stack}')::integer
    ),
    l.published_at
  from public.game_listings l
  join public.games g on g.id = l.game_id
  join public.game_players p on p.game_id = g.id
  join public.game_hosts h on h.game_id = g.id
  where l.is_public
    and l.host_lease_expires_at > clock_timestamp()
    and g.status = 'waiting'
    and h.host_token <> coalesce(p_player_token, '')
    and not exists (
      select 1 from public.game_players mine
      where mine.game_id = g.id
        and mine.status = 'claimed'
        and mine.player_token = p_player_token
    )
    and exists (
      select 1 from public.game_players available
      where available.game_id = g.id and available.status = 'open'
    )
    and (
      p_cursor_published_at is null
      or (l.published_at, l.game_id) < (p_cursor_published_at, p_cursor_game_id)
    )
  group by g.id, l.title, l.published_at
  order by l.published_at desc, g.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

create or replace function public.set_game_publication_if_version(
  p_game_id uuid,
  p_expected_version bigint,
  p_host_token text,
  p_is_public boolean,
  p_title text
)
returns setof public.games
language plpgsql
security invoker
set search_path = public
as $$
declare
  locked_game public.games;
  normalized_title text := nullif(left(btrim(coalesce(p_title, '')), 60), '');
begin
  select * into locked_game from public.games where id = p_game_id for update;
  if not found or locked_game.version <> p_expected_version then return; end if;
  if locked_game.status <> 'waiting' then
    raise exception 'GAME_UNAVAILABLE';
  end if;
  if not exists (
    select 1 from public.game_hosts
    where game_id = p_game_id and host_token = p_host_token
  ) then
    raise exception 'NOT_HOST';
  end if;

  insert into public.game_listings (
    game_id, is_public, title, published_at, host_lease_expires_at
  ) values (
    p_game_id, p_is_public, normalized_title, clock_timestamp(),
    case when p_is_public then clock_timestamp() + interval '2 minutes'
         else clock_timestamp() end
  )
  on conflict (game_id) do update set
    is_public = excluded.is_public,
    title = excluded.title,
    published_at = case
      when excluded.is_public and not game_listings.is_public
        then excluded.published_at
      else game_listings.published_at
    end,
    host_lease_expires_at = excluded.host_lease_expires_at;

  return query update public.games
    set version = version + 1
    where id = p_game_id
    returning *;
end;
$$;

create or replace function public.renew_game_listing_lease(
  p_game_id uuid,
  p_host_token text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare renewed boolean;
declare affected integer;
begin
  update public.game_listings l
    set host_lease_expires_at = clock_timestamp() + interval '2 minutes'
    from public.games g, public.game_hosts h
    where l.game_id = p_game_id
      and l.game_id = g.id
      and l.game_id = h.game_id
      and l.is_public
      and g.status = 'waiting'
      and h.host_token = p_host_token;
  get diagnostics affected = row_count;
  renewed := affected > 0;
  return renewed;
end;
$$;

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

  if locked_game.version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'version', locked_game.version);
  end if;
  if locked_game.status <> 'waiting'
    or exists (
      select 1 from public.game_hosts
      where game_id = p_game_id and host_token = p_player_token
    )
    or not exists (
      select 1 from public.game_listings
      where game_id = p_game_id and is_public
        and host_lease_expires_at > clock_timestamp()
    ) then
    return jsonb_build_object('outcome', 'unavailable');
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

create or replace function public.claim_game_seat_if_version(
  p_game_id uuid, p_expected_version bigint, p_seat integer,
  p_player_token text, p_name text
)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare locked_game public.games; existing public.game_players; target public.game_players; new_version bigint;
begin
  select * into locked_game from public.games where id = p_game_id for update;
  if not found then return jsonb_build_object('outcome', 'missing'); end if;
  select * into existing from public.game_players where game_id = p_game_id and status = 'claimed' and player_token = p_player_token order by seat limit 1 for update;
  if found and existing.seat = p_seat then return jsonb_build_object('outcome', 'ok', 'seat', to_jsonb(existing), 'version', locked_game.version); end if;
  if locked_game.version <> p_expected_version then return jsonb_build_object('outcome', 'conflict'); end if;
  select * into target from public.game_players where game_id = p_game_id and seat = p_seat for update;
  if not found then return jsonb_build_object('outcome', 'missing'); end if;
  if target.status <> 'open' then return jsonb_build_object('outcome', 'unavailable'); end if;
  if existing.id is not null then
    update public.game_players set status='open', name='Seat '||(existing.seat+1), controller='human', player_token=null, is_host=false, leaving=false, engine_player_id=null,
      bot_id=null, bot_label=null, bot_provider=null, bot_model_id=null, ai_difficulty=null, bot_profile_id=null where id=existing.id;
  end if;
  update public.game_players set status='claimed', controller='human', name=coalesce(nullif(left(btrim(coalesce(p_name,'')),30),''), coalesce(existing.name,'Player '||(p_seat+1))),
    player_token=p_player_token, is_host=coalesce(existing.is_host,false), leaving=false,
    engine_player_id=coalesce(existing.engine_player_id, target.engine_player_id, 'seat-'||p_game_id||'-'||p_seat),
    bot_id=null, bot_label=null, bot_provider=null, bot_model_id=null, ai_difficulty=null, bot_profile_id=null
    where id=target.id returning * into target;
  update public.games set version=version+1 where id=p_game_id returning version into new_version;
  return jsonb_build_object('outcome','ok','seat',to_jsonb(target),'version',new_version);
end; $$;

create or replace function public.assign_bot_to_seat_if_version(
  p_game_id uuid, p_expected_version bigint, p_seat integer, p_host_token text,
  p_name text, p_bot_id text, p_bot_label text, p_bot_provider text,
  p_bot_model_id text, p_ai_difficulty text, p_bot_profile_id text
)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare locked_game public.games; target public.game_players; new_version bigint;
begin
  select * into locked_game from public.games where id=p_game_id for update;
  if not found then return jsonb_build_object('outcome','missing'); end if;
  if locked_game.version <> p_expected_version then return jsonb_build_object('outcome','conflict'); end if;
  if not exists(select 1 from public.game_hosts where game_id=p_game_id and host_token=p_host_token) then return jsonb_build_object('outcome','forbidden'); end if;
  select * into target from public.game_players where game_id=p_game_id and seat=p_seat for update;
  if not found then return jsonb_build_object('outcome','missing'); end if;
  if target.status <> 'open' then return jsonb_build_object('outcome','unavailable'); end if;
  update public.game_players set status='bot', controller='bot', name=p_name, player_token=null, is_host=false, leaving=false,
    engine_player_id=coalesce(engine_player_id,'bot-'||p_game_id||'-'||p_seat), bot_id=p_bot_id, bot_label=p_bot_label,
    bot_provider=p_bot_provider, bot_model_id=p_bot_model_id, ai_difficulty=p_ai_difficulty, bot_profile_id=p_bot_profile_id
    where id=target.id returning * into target;
  update public.games set version=version+1 where id=p_game_id returning version into new_version;
  return jsonb_build_object('outcome','ok','seat',to_jsonb(target),'version',new_version);
end; $$;

create or replace function public.release_game_seat_if_version(
  p_game_id uuid, p_expected_version bigint, p_seat integer, p_player_token text
)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare locked_game public.games; target public.game_players; new_version bigint; caller_is_host boolean;
begin
  select * into locked_game from public.games where id=p_game_id for update;
  if not found then return jsonb_build_object('outcome','missing'); end if;
  if locked_game.version <> p_expected_version then return jsonb_build_object('outcome','conflict'); end if;
  select exists(select 1 from public.game_hosts where game_id=p_game_id and host_token=p_player_token) into caller_is_host;
  select * into target from public.game_players where game_id=p_game_id and seat=p_seat for update;
  if not found then return jsonb_build_object('outcome','missing'); end if;
  if not caller_is_host and target.player_token is distinct from p_player_token then return jsonb_build_object('outcome','forbidden'); end if;
  if locked_game.status='waiting' then
    update public.game_players set status='open', name='Seat '||(p_seat+1), controller='human', player_token=null, is_host=false, leaving=false, engine_player_id=null,
      bot_id=null, bot_label=null, bot_provider=null, bot_model_id=null, ai_difficulty=null, bot_profile_id=null where id=target.id returning * into target;
  else
    update public.game_players set is_host=false, leaving=true where id=target.id returning * into target;
  end if;
  update public.games set version=version+1 where id=p_game_id returning version into new_version;
  return jsonb_build_object('outcome','ok','seat',to_jsonb(target),'version',new_version);
end; $$;

revoke all on function public.list_public_games(text, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_public_games(text, timestamptz, uuid, integer)
  to service_role;
revoke all on function public.set_game_publication_if_version(uuid, bigint, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_game_publication_if_version(uuid, bigint, text, boolean, text)
  to service_role;
revoke all on function public.renew_game_listing_lease(uuid, text)
  from public, anon, authenticated;
grant execute on function public.renew_game_listing_lease(uuid, text)
  to service_role;
revoke all on function public.join_public_game_if_version(uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.join_public_game_if_version(uuid, bigint, text, text)
  to service_role;
revoke all on function public.claim_game_seat_if_version(uuid,bigint,integer,text,text) from public,anon,authenticated;
grant execute on function public.claim_game_seat_if_version(uuid,bigint,integer,text,text) to service_role;
revoke all on function public.assign_bot_to_seat_if_version(uuid,bigint,integer,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.assign_bot_to_seat_if_version(uuid,bigint,integer,text,text,text,text,text,text,text,text) to service_role;
revoke all on function public.release_game_seat_if_version(uuid,bigint,integer,text) from public,anon,authenticated;
grant execute on function public.release_game_seat_if_version(uuid,bigint,integer,text) to service_role;
