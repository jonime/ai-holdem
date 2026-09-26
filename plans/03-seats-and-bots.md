# Seats, Multiplayer Humans, and Bot Assignment

## Why This Is Next

The schema already models this reasonably well:
`game_players.controller` is `human | typesafe_ai` and seats are just
integers with a `unique (game_id, seat)` constraint
([20260921000000_initial_game_schema.sql](../supabase/migrations/20260921000000_initial_game_schema.sql#L14-L23)).
The gap is entirely in game creation and orchestration: today
`createDemoGame` always creates exactly the two hardcoded players in
`demoGameConfig` ([game-service.ts](../lib/poker/game-service.ts#L18-L34)),
and the client always assumes seat 0 is "you" and seat 1 is the AI. This plan
turns "who sits where" into a real join flow. It depends on
[02-game-urls-and-identity.md](./02-game-urls-and-identity.md) (a shareable
URL and a stable per-browser token) but not on Realtime or spectating.

## Outcome

* A host creates a game with N configurable seats (still heads-up by default,
  but the data model and orchestrator no longer assume exactly 2 players).
* Seats start `open`. Any browser with the game URL can claim an open seat as
  a human, using its player token.
* The host can assign a TypeSafe AI bot to any open seat instead of waiting
  for a human.
* The turn engine (`stepGame` / orchestrator) dispatches strictly by
  `controller`, as the original plan already intends — this plan makes that
  true in the multi-seat case, not just the 2-seat demo case.

## Design

### Schema changes

Add to `game_players` (new migration
`20260923000000_add_seat_claiming.sql`):

```sql
alter table public.game_players
  add column status text not null default 'open'
    check (status in ('open', 'claimed', 'bot')),
  add column player_token text,
  add column is_host boolean not null default false;

-- one claimed/bot seat per (game, player_token) isn't required; a token
-- could own multiple seats later, so don't over-constrain yet.
create index game_players_token_idx
  on public.game_players (game_id, player_token)
  where player_token is not null;
```

* `status = 'open'` + `controller` unset/pending means "waiting for
  someone"; consider allowing `controller` to be nullable until claimed, or
  keep a `pending` controller value — pick whichever keeps the existing
  `check` constraint simplest (likely: controller stays required, defaulting
  new open seats to `human`, and `status='open'` is what actually gates
  play).
* `is_host` marks the browser that created the game, so only it can assign
  bots to remaining open seats (simple authorization: compare
  `player_token` to the host's token server-side).

### Game creation

* Replace the single `demoGameConfig` with a request body for
  `POST /api/games`, e.g. `{ seatCount: 2 }`, defaulting to today's
  human-vs-AI setup so existing behavior is unchanged when no body is sent.
* Creating a game claims seat 0 for the creating browser's player token and
  marks it host + `status='claimed'`; remaining seats start `open` (or,
  matching today's default, seat 1 auto-assigned to `typesafe_ai` +
  `status='bot'` unless the request says otherwise).

### New API routes

* `POST /api/games/:id/seats/:seat/claim` — claims an open seat as the
  calling browser's human player. Rejects if seat isn't `open`, if the game
  already started, or if the token already holds a seat (configurable
  later).
* `POST /api/games/:id/seats/:seat/assign-bot` — host-only; assigns
  `typesafe_ai` to an open seat.
* `POST /api/games/:id/seats/:seat/release` — host-only or self-release,
  for completeness (a claimed human seat becomes `open` again). Keep this
  minimal; it's easy to expand later.
* All of these are version-checked writes against `game_players`/`games`
  the same way `/action` already is — reuse the compare-and-swap pattern
  rather than inventing a new one.

### Orchestrator / turn dispatch

* `stepGame` already should dispatch by `controller`
  ([initial.md](./01-mvp-typesafe-poker.md) design). Audit
  `lib/poker/game-service.ts` and the orchestrator to confirm nothing
  hardcodes "seat 0 is human, seat 1 is AI" — replace any such assumption
  with a lookup over `game_players`.
* A hand cannot start until every seat is `claimed` or `bot` (no `open`
  seats). `POST /api/games/:id/start` (or equivalent) must check this and
  return a clear "waiting for players" error otherwise.

### Client changes

* `PokerApp` needs a "lobby" state for a game that still has open seats:
  show seats, who (if anyone) occupies each, a "Sit here" button for open
  seats, and (host-only) "Assign bot" per open seat.
* Determine "am I this seat" client-side by comparing the seat's stored
  player token to the browser's own token, returned by the API only for
  the caller's own seat(s) — never leak other browsers' tokens in the public
  DTO.

## Steps

1. Migration: add `status`, `player_token`, `is_host` to `game_players`.
2. Extend `PersistedGame`/query layer in
   [lib/supabase/queries.ts](../lib/supabase/queries.ts) to read/write seat
   status and token.
3. Update `createDemoGame`/`createGameSession` to accept seat count and host
   token, and stop hardcoding two players as the only possible shape.
4. Add claim/assign-bot/release routes with version-checked writes and
   host/token authorization.
5. Add a "not all seats filled" guard to hand-start / next-hand logic.
6. Update `PublicPokerGame`/`PublicPokerPlayer` DTO to include seat `status`
   and (only for the caller's own seat) enough info for the client to know
   "this is you."
7. Build the lobby UI in `PokerApp` (or a new `SeatLobby` component) for
   open/claimed/bot seat states.
8. Tests: claiming an already-claimed seat fails; non-host cannot
   assign-bot; hand cannot start with an open seat; a claimed human seat
   plays turns exactly like today's hardcoded human seat.

## Explicit non-goals here

* No live updates across browsers when someone claims a seat — that seat
  list still just refreshes on the polling/reload cadence already in
  `PokerApp` until [05-realtime-broadcast.md](./05-realtime-broadcast.md)
  lands.
* No spectator (view-only, unseated) role yet — that's
  [04-spectator-mode.md](./04-spectator-mode.md), built on top of this
  seat-status model.
* Still heads-up rules-wise (2 active players) unless/until the poker
  engine adapter is verified to support 3+ players; don't claim N-way
  support in the UI before the adapter is proven to handle it.
