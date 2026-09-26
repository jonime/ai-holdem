# Flexible Seat Counts, Lobby, and a Host-Optional Table

## Why This Is Next

Plans [03](./03-seats-and-bots.md), [04](./04-spectator-mode.md), and
[05](./05-realtime-broadcast.md) already shipped the seat-status model
(`open | claimed | bot`), claim/assign-bot/release routes, spectator viewing,
and live Realtime updates. But a close read of the current code shows the
"configurable seat count" part of plan 03 is only half-real:

* `POST /api/games` already accepts `{ seatCount }` and stores it on
  `GameConfig.seatCount`
  ([game-service.ts](../lib/poker/game-service.ts#L19-L52),
  [route.ts](../app/api/games/route.ts#L14-L20)), and the adapter passes it
  to the engine as `maxSeats`
  ([adapter.ts](../lib/poker/adapter.ts#L155-L163)).
* But `createDemoGameConfig` always seats **exactly two** engine players —
  the host at seat 0 and one bot at seat 1 — regardless of `seatCount`. Any
  seat beyond seat 1 is never written to `game_players` at all, because
  `create_game_session` only inserts rows for `config.players`
  ([20260923000000_add_seat_claiming.sql](../supabase/migrations/20260923000000_add_seat_claiming.sql#L14-L36)).
* `claimSeat` / `assignBotToSeat` only look up an *existing*
  `game_players` row and flip its `status`/`controller`/`playerToken`
  columns ([game-service.ts](../lib/poker/game-service.ts#L128-L221)). They
  never touch the poker engine's `TableState` or `GameConfig.players`. So
  even a seat that *does* have an `open` row (seat 1 today, if you don't
  auto-assign a bot) can't actually be claimed into a playable engine
  participant beyond the two players baked in at creation.
* The hand is also started immediately inside `createDemoGame`
  ([game-service.ts](../lib/poker/game-service.ts#L142-L146)) — there is no
  "waiting for more players" lobby state, even though `games.status` already
  has a `waiting` value in the schema
  ([20260921000000_initial_game_schema.sql](../supabase/migrations/20260921000000_initial_game_schema.sql#L4)).

In short: today you can request `seatCount: 6`, but only 2 of those 6 seats
can ever be filled or played. This plan closes that gap so "define the
number of seats, host seeds the table, others join or get bots" is real,
while keeping the engine (never the client) authoritative for who's
actually seated and whose turn it is.

## Decisions (resolved before writing this plan)

These were open questions; answers below drive the design:

* **Max seats**: cap at **6** (`seatCount` accepted range is `2–6`).
  Revisit later if the engine is verified to support more and there's demand.
* **Host role is convenience, not authority that outlives the seat.** The
  creator defaults into seat 0 and is flagged `is_host`. If the host stands
  up (releases their seat to spectate, or disconnects and someone frees
  their seat), the game becomes **host-less**: no one is re-promoted.
  Host-gated actions (seat-count is fixed at creation so N/A there; assigning
  bots, starting the hand) simply become available to **any caller** once no
  seat is `is_host`. This matches the project's existing no-auth, "URL is
  the access control" demo posture (see `AGENTS.md`) rather than inventing a
  host-election protocol.
* **Mid-hand departure**: a human can request to stand up at any time, but
  if a hand is in progress they are **auto-folded for the rest of that hand
  only** and their seat is marked "leaving" — it becomes truly `open` (and
  reusable) only once the hand completes. They cannot be dealt back into a
  hand already in progress.
* **Starting the hand**: the host (or, once host-less, any caller) can start
  play as soon as **2 or more** seats are filled (claimed or bot). Any seats
  still `open` at that moment simply stay unused for that hand — they are
  not auto-filled with bots. They remain joinable between hands (see below),
  so a 6-seat game can start 2-handed and grow over time.
* **Scope**: stay tight to seats + host lifecycle + AI assignment. Presence,
  reconnect UX, kicking players, and lobby chat are noted as future ideas
  only (see "Ideas for later"), not designed here.

## Outcome

* Creating a game lets the host pick a seat count from 2–6. The host is
  seated at seat 0 by default; every other seat starts `open`.
* The host can assign a TypeSafe AI bot to any open seat, or leave it open
  for a human to claim via the shared URL — same as today, just now working
  for *all* configured seats, not just seat 1.
* The host can start the hand once at least one other seat (human or bot)
  is filled. The game moves from `waiting` to `playing` at that point.
* A game in `waiting` status is a real lobby: spectators see seats fill in
  live (via existing Realtime), the host sees a "Start hand" control once
  the minimum is met.
* Between hands, still-open seats can be claimed or bot-assigned, and newly
  filled seats join the *next* hand — the table can grow over a session
  without restarting the game.
* The host can release their own seat to become a spectator. Doing so
  clears `is_host` and does not reassign it; remaining management actions
  become open to anyone with the URL, consistent with the rest of the demo.
* A human who stands up mid-hand is auto-folded for the remainder of that
  hand; their seat opens up once the hand resolves.

## Design

### Schema changes (new migration, e.g. `20260924000000_add_seat_lifecycle.sql`)

```sql
-- Open seats can now exist with no engine participant yet.
alter table public.game_players
  alter column engine_player_id drop not null;

drop index if exists game_players_game_id_engine_player_id_key;
create unique index game_players_game_id_engine_player_id_key
  on public.game_players (game_id, engine_player_id)
  where engine_player_id is not null;

-- A seat that stood up mid-hand is not free yet; it frees at hand end.
alter table public.game_players
  add column leaving boolean not null default false;

alter table public.games
  add column min_seats_to_start integer not null default 2
    check (min_seats_to_start >= 2);
```

* `engine_player_id` becomes nullable so `create_game_session` can insert
  placeholder rows (`status = 'open'`, no `engine_player_id`, no
  `controller` yet — pick a harmless default like `'human'` for the
  `controller` check constraint, it's meaningless until claimed) for every
  seat from `0` to `seatCount - 1`, not just the ones seeded with an actual
  engine player.
* `leaving` distinguishes "requested to stand up, still finishing this
  hand" from `open`. The public projection should still show these seats as
  occupied (so opponents/spectators don't see a seat vanish mid-hand) but
  the client can show a "leaving after this hand" badge.
* `min_seats_to_start` isn't strictly required (2 is always the rule per
  the decision above) but keeping it as a column avoids hardcoding `2` in
  three different call sites and leaves room to raise it later per game.

### Engine/adapter: seating and un-seating between hands

This is the actual gap. Today `pokerEngineAdapter.createGame` is the *only*
place a `seat-player` transition happens, and it happens once, synchronously,
for the full player list. To support joining/leaving between hands we need:

1. **Audit `@hivetech/poker-engine`'s transition set** (first implementation
   task, before writing app code): confirm whether `seat-player` can be
   applied to an already-created `TableState` when `table.hand` is `null`
   (i.e., between hands), and whether there's a corresponding "leave seat" /
   "stand up" transition. Do not assume symmetry with `createTable` — read
   the installed package's type declarations and any docs, the same way
   [adapter.ts](../lib/poker/adapter.ts) already does for existing
   transitions.
2. Add adapter functions mirroring existing ones, e.g.:
   * `pokerEngineAdapter.seatPlayer(state, playerConfig)` — applies
     `seat-player` to the current `TableState` (only valid when no hand is
     in progress) and returns updated `PokerGameState` with `config.players`
     extended.
   * `pokerEngineAdapter.removePlayer(state, playerId)` — applies the
     engine's leave/stand-up transition (only valid when no hand is in
     progress) and returns `PokerGameState` with that player removed from
     `config.players`.
   * If the engine has no incremental "add/remove between hands" transition,
     the fallback is to rebuild the table from scratch via `createGame` with
     the reconciled player list and each player's *current* stack (not the
     original buy-in), immediately before `startHand` — the engine has no
     other state worth preserving between hands. Prefer this if the audit
     shows no first-class support; it's simpler than fighting the engine's
     transition model.
3. `GameConfig.players` stops being "whatever was true at creation" and
   becomes "whatever is true right now," reconciled from `game_players` at
   two points only: **right before a hand starts** (pick up anyone claimed
   or bot-assigned since last hand, drop anyone `leaving`) — never mid-hand.

### Game creation / lobby

* `POST /api/games` body becomes `{ seatCount?: number }`, validated to
  `2–6` (reject/clamp outside that range — the route already clamps to a
  minimum, just add the upper bound).
* `createDemoGame` (candidate rename: `createGame`, since "demo" undersells
  it — but that's a bigger rename than this plan needs to force; keep the
  name if it's used broadly, otherwise rename for clarity) changes to:
  * Seat 0: host, `status = 'claimed'`, `is_host = true`, engine player
    created immediately.
  * Seats `1..seatCount-1`: `status = 'open'`, no engine player, inserted
    as placeholder `game_players` rows.
  * Engine table created via `createGame` with **only the host** as an
    initial engine participant (`maxSeats = seatCount`, one seated player).
  * `games.status = 'waiting'`, **no `startHand` call yet**.
* A new route, `POST /api/games/:id/start`, transitions `waiting` → the
  first hand:
  * Validates at least 2 seats are filled (`claimed` or `bot`).
  * Callable by the host if one exists, otherwise by anyone (host-less
    rule above).
  * Reconciles `game_players` → engine `config.players` (adds any bot/claimed
    seats not yet in the engine table), then calls `startHand`, persists,
    flips `games.status` to `'playing'`.
* `claimSeat` / `assignBotToSeat` keep their existing authorization and
  version-checked-write shape, but now also handle the "no engine player
  yet" case: if the game is still `waiting`, or if it's between hands, seat
  the new player into the engine table right away (via the adapter function
  above) so the very next hand includes them. If a hand is currently in
  progress, just update the `game_players` row; the seat/removal is applied
  at the next hand-start reconciliation instead of immediately, since the
  engine cannot accept new players mid-hand.
* `releaseSeat` gains the mid-hand distinction:
  * No hand in progress → immediately `open`, and if it had an engine
    player, remove them from the engine table now.
  * Hand in progress → mark `leaving = true` (still `claimed`/`bot` for
    projection purposes), auto-fold that player's future actions for the
    rest of this hand (the orchestrator already has to skip past players
    it can't get a decision from — for a `leaving` human seat, treat it like
    an immediate fold whenever it's their turn, deterministically, not by
    waiting on the AI or a human decision), and only flip to `open` /
    remove-from-engine at the next hand boundary alongside the normal
    reconciliation step.
* Host self-release (`POST /api/games/:id/seats/0/release` equivalent, or a
  more explicit `POST /api/games/:id/host/leave`) is the same `releaseSeat`
  call, plus clearing `is_host` with no replacement — do this as one
  version-checked write, not two, to avoid a window where the row is
  neither host nor reassigned consistently.
* Route authorization for "host-gated" actions (assign-bot, start,
  seat-count was fixed at creation) becomes: allow if caller's token matches
  a seat with `is_host = true`, **or** if no seat currently has
  `is_host = true` at all. Encapsulate this check once (e.g.
  `canManageTable(seatAssignments, callerToken)`) rather than repeating the
  "is there a host, and if so am I them" logic in every route.

### Orchestrator / turn dispatch

* `stepGame`/the human-action and AI-step paths already dispatch by
  `controller` off `config.players` — confirm they now also tolerate
  `config.players` growing/shrinking between hands (they should, since nothing
  should assume a fixed length beyond `>= 2`).
* Add the "leaving player auto-folds when it's their turn" rule described
  above as an explicit, tested branch in the action-submission path (likely
  in [human-actions.ts](../lib/poker/human-actions.ts) or the orchestrator
  layer above it) — this must happen server-side and deterministically, not
  rely on the client ever calling `/action` for a player who's leaving.

### Client / UI

* `PokerApp` gets an explicit lobby state for `games.status === 'waiting'`:
  seat grid showing `open` (with "Sit here" / host-only "Assign bot"),
  `claimed`, `bot`; a "Start hand" button gated on `>= 2` filled seats and
  visible to whoever currently has management rights (host, or anyone if
  host-less); everyone else sees a "waiting for host to start" message.
* Add a seat-count picker to the "create game" entry point (default 2,
  matching today's behavior when unset).
* Add a "Stand up" control for a seated human at any time; if a hand is in
  progress, show it as "Leave after this hand" and reflect the `leaving`
  flag once set (e.g. a small badge on that seat) so other players
  understand why that seat won't act again.
* When the host stands up, no special client-side prompt is needed beyond
  the seat becoming `open`/removed and `is_host` clearing — any subsequently
  loaded game state already reflects "no host," and the "management" UI
  affordances (assign bot, start hand) should appear for whoever's viewing
  once that's true, per the server-side authorization rule above.

## Steps

1. Audit `@hivetech/poker-engine`'s transition types for between-hand
   seat/leave support (or confirm the "rebuild table from `createGame`
   before each hand" fallback is required). Record the finding before
   writing adapter code.
2. Migration: nullable `engine_player_id`, partial unique index, `leaving`
   column, `min_seats_to_start` column.
3. Extend `create_game_session` RPC and `PersistedGame`/query layer to
   accept and round-trip placeholder (no-engine-player) seats.
4. Add adapter functions for seating/removing a player between hands
   (or the rebuild fallback), and a reconciliation helper that diffs
   `game_players` against `config.players`.
5. Change `createDemoGame`/`createGame` to seed the host only, leave the
   rest `open`, and set `games.status = 'waiting'` without starting a hand.
6. Add `POST /api/games/:id/start` (min-2-filled check, host-or-host-less
   authorization, reconciliation + `startHand`).
7. Update `claimSeat`, `assignBotToSeat`, `releaseSeat` for: seating a new
   engine player immediately when safe (waiting or between hands), the
   `leaving` mid-hand path, and the "host-less" authorization rule.
8. Add the deterministic auto-fold-on-turn behavior for `leaving` seats to
   the orchestrator/action path.
9. Update `PublicPokerGame`/`PublicPokerPlayer` DTOs to expose `leaving`
   and whatever "can I manage this table" flag the client needs (or let the
   client derive it from `players` + its own token, same pattern as
   "is this seat me").
10. Build the lobby UI (seat-count picker on create, waiting-room seat grid,
    Start hand button, Stand up / Leave-after-this-hand control).
11. Tests: seat count clamps to 2–6; placeholder seats round-trip through
    persistence; claiming/bot-assigning a placeholder seat mid-lobby seats
    them into the engine before the first hand; starting with 2 filled
    seats out of 6 works and the remaining 4 stay open and joinable later;
    claiming/bot-assigning while a hand is in progress doesn't touch the
    engine until the next hand boundary; standing up mid-hand auto-folds
    that seat for the rest of the hand and only frees the seat after; host
    release clears `is_host` with no reassignment and unlocks host-gated
    routes for any caller afterward.

## Ideas for later (not designed here)

* **Presence / reconnect UX**: show who's actively connected vs. just
  holding a claimed seat; auto-mark a seat `leaving` if its browser has been
  gone for some timeout, so a dropped connection doesn't hold a seat
  hostage forever.
* **Kick a stuck bot or unresponsive human**: today only self-release or
  host release exists; a "vote to remove" or timeout-based auto-fold-then-
  release for an AFK human would help longer sessions.
* **Per-seat buy-in / rebuy**: right now every seat gets the same fixed
  starting stack; letting the host set a buy-in per game (or allowing
  rebuys for busted players) would make longer multi-hand sessions more
  interesting.
* **Lobby chat / ready-check**: a lightweight "I'm ready" toggle so the host
  doesn't have to guess whether other seated humans are paying attention
  before starting.
* **Bigger tables**: if there's real demand beyond 6-max, revisit after
  confirming the engine's actual seat ceiling — don't raise the cap in the
  UI without re-verifying the adapter audit from Step 1.
* **Host handoff instead of host-less**: if the "anyone can manage" posture
  ever feels too permissive (e.g. this demo grows real auth), replace it
  with an explicit transfer to the next seated human instead of dropping
  host entirely.

## Explicit non-goals here

* No real authentication or per-seat access control beyond the existing
  player-token-in-a-cookie model — "host-less" deliberately leans on the
  same "URL is the access boundary" posture the rest of the app already
  uses, not a new permissions system.
* No change to core Hold'em rules/stakes handling (blinds, side pots, etc.)
  — this plan only changes *who* is seated and *when*, not how a hand is
  played once everyone's in.
* No support for seats rejoining mid-hand under any circumstances — a
  `leaving` or `open` seat is only ever picked back up at the next hand
  boundary.
