# Supabase Realtime (Broadcast) for Game Events

## Why This Is Last

The original plan is explicit: "Do not begin Realtime work until the normal
HTTP flow passes the UI gate," and "Realtime should distribute changes, not
become the source of truth."
([01-mvp-typesafe-poker.md](./01-mvp-typesafe-poker.md)). This plan assumes
plans [02](./02-game-urls-and-identity.md), [03](./03-seats-and-bots.md), and
[04](./04-spectator-mode.md) already work correctly over plain HTTP
request/response (polling or manual refresh). Realtime is purely a transport
upgrade on top of that — it must not change who is authoritative (Postgres +
the poker engine adapter remain authoritative; Realtime only announces that
something changed).

## Outcome

* Every browser viewing a game (player or spectator) sees seat claims, human
  actions, AI decisions, and hand transitions appear live, without polling.
* If Realtime is unavailable or a message is dropped, the client still
  converges to correct state on next load/poll — Realtime is an optimization,
  not a requirement for correctness.

## Design

### Transport choice: Broadcast, not Postgres Changes

Use a Supabase Realtime **Broadcast** channel per game, e.g. `game:<gameId>`,
matching the channel/event names the original plan already sketches:

```text
game_updated
player_action
ai_decision
hand_started
hand_completed
seat_claimed      (new, from plan 03)
```

Broadcast (not Postgres Changes) because:

* Events are already well-defined application concepts (we emit exactly what
  changed, e.g. "seat 1 claimed" or "AI decided raise"), not raw row diffs
  that the client would have to reinterpret.
* It avoids exposing `games`/`game_players`/`actions` row contents directly
  over Realtime, which matters here because those rows can contain private
  AI state (`ai_decisions.state`, `raw_response`) that must stay hidden until
  a hand completes — Postgres Changes would require very careful RLS/column
  filtering per subscriber to avoid leaking it, whereas Broadcast payloads
  are exactly the sanitized public DTOs the HTTP routes already produce.

### Emitting events

* Emit Broadcast events from the **server**, right after each successful
  version-checked write (`/action`, `/step`, seat claim/assign-bot, next-hand
  start) — not from the client, so a browser can't forge an event for a
  mutation it didn't actually cause.
* Payload = the same sanitized DTO the HTTP response already returns
  (`PublicGame`, `PublicAIDecision`, etc.) plus a small envelope
  (`type`, `gameId`, `version`). Never include private hole cards or raw
  AI state in a broadcast that spectators/opponents also receive — same
  masking rules as plan 04, applied per-recipient is not possible with a
  single shared channel, so **the broadcast itself must already be the
  fully-masked "no active secrets" projection**; anything seat-private (a
  human's own hole cards) is *not* sent over Realtime at all and stays a
  per-request HTTP concern (client refetches its own private view after
  being notified something changed).
* Use the `version` field for staleness detection: if a client receives an
  event with `version <= ` the version it already has, ignore it (it's a
  redundant re-send, not a regression — Postgres remains the source of
  truth for actual state).

### Consuming events

* Client subscribes to `game:<gameId>` on mount (game page from plan 02),
  for both seated players and spectators (plan 04).
* On any event, the simplest and most robust reaction is: refetch
  `GET /api/games/:id` (and `/history` if relevant) rather than trying to
  apply the broadcast payload as a state patch. This keeps Realtime as a
  "wake up and refetch" signal, minimizing the chance of client/server
  drift. Only optimize to "apply payload directly" later if refetch traffic
  becomes a real problem.
* Keep the existing polling/manual-refresh path working as a fallback if the
  channel disconnects (Supabase client reconnect handling), so the app
  degrades gracefully rather than silently going stale.

### Security

* Use Supabase's Realtime Authorization for Broadcast (private channels) so
  only requests presenting a valid context can subscribe/publish; since this
  app has no real auth yet, scope this minimally (e.g. anyone who knows the
  `gameId` can subscribe, matching the existing "URL is the access control"
  demo posture) and document that this is intentionally permissive for the
  demo, not production-ready.
* The server-side emit must use the service-role/secret key (never exposed
  to the browser), consistent with how `SUPABASE_SECRET_KEY` is already kept
  server-only ([server.ts](../lib/env/server.ts)).

## Steps

1. Add a small `lib/realtime/publish.ts` server-side helper wrapping the
   Supabase Realtime Broadcast send, given `gameId`, event `type`, and a
   pre-sanitized payload.
2. Call it from the end of each existing mutating route
   (`/action`, `/step`, seat claim/assign-bot from plan 03, next-hand) right
   after the DB write succeeds — fire-and-forget, must not block or fail the
   HTTP response if the broadcast send errors (log and continue).
3. Add a client hook (`lib/realtime/useGameChannel.ts` or similar) that
   subscribes to `game:<gameId>` and triggers a refetch callback on any
   event.
4. Wire the hook into the game page/`PokerApp` so it replaces (or
   supplements, initially) the current polling.
5. Manual test: two browser windows on the same game URL; confirm an action
   in one appears in the other within roughly a second, without a manual
   refresh.
6. Test the degraded path: simulate a dropped channel (or just don't
   subscribe) and confirm the existing request/response flow still works
   unchanged.

## Explicit non-goals here

* No Realtime Presence (viewer counts) — mentioned only as a possible
  future addition in plan 04, not part of this plan.
* No client-side optimistic state application from broadcast payloads —
  refetch-on-signal only, to keep the authoritative-state architecture
  simple, per the original plan's explicit caution.
