create extension if not exists pgcrypto;

create table public.games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'complete', 'error')),
  current_state jsonb not null,
  state_schema_version integer not null default 1 check (state_schema_version > 0),
  hand_number integer not null default 0 check (hand_number >= 0),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  seat integer not null check (seat >= 0),
  name text not null check (char_length(name) > 0),
  controller text not null check (controller in ('typesafe_ai', 'human')),
  stack integer not null check (stack >= 0),
  created_at timestamptz not null default now(),
  unique (game_id, seat)
);

create table public.hands (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  hand_number integer not null check (hand_number > 0),
  status text not null check (status in ('playing', 'complete', 'error')),
  initial_state jsonb not null,
  final_state jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (game_id, hand_number),
  check ((status = 'complete') = (completed_at is not null))
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  hand_id uuid not null references public.hands(id) on delete cascade,
  player_id uuid not null references public.game_players(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  street text not null check (street in ('preflop', 'flop', 'turn', 'river')),
  action text not null check (action in ('fold', 'check', 'call', 'bet', 'raise', 'all_in')),
  amount integer check (amount is null or amount >= 0),
  state_before jsonb not null,
  state_after jsonb not null,
  created_at timestamptz not null default now(),
  unique (hand_id, sequence)
);

create table public.ai_decisions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  hand_id uuid not null references public.hands(id) on delete cascade,
  player_id uuid not null references public.game_players(id) on delete restrict,
  action_sequence integer not null check (action_sequence > 0),
  state jsonb not null,
  legal_actions jsonb not null,
  choice text not null,
  probabilities jsonb not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  raise_size_choice text,
  raise_size_probabilities jsonb,
  raw_response jsonb not null,
  created_at timestamptz not null default now(),
  unique (hand_id, action_sequence)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger games_set_updated_at
before update on public.games
for each row execute function public.set_updated_at();

create or replace function public.update_game_state_if_version(
  p_game_id uuid,
  p_expected_version bigint,
  p_current_state jsonb,
  p_status text,
  p_hand_number integer,
  p_state_schema_version integer
)
returns setof public.games
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  update public.games
  set
    current_state = p_current_state,
    status = p_status,
    hand_number = p_hand_number,
    state_schema_version = p_state_schema_version,
    version = version + 1
  where id = p_game_id
    and version = p_expected_version
  returning *;
end;
$$;

revoke all on function public.update_game_state_if_version(uuid, bigint, jsonb, text, integer, integer) from public;
revoke all on function public.update_game_state_if_version(uuid, bigint, jsonb, text, integer, integer) from anon, authenticated;

alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.hands enable row level security;
alter table public.actions enable row level security;
alter table public.ai_decisions enable row level security;