# Supabase Realtime notifications

Postgres and the poker engine remain authoritative. Broadcast only prompts a
viewer to refetch its own HTTP projection; clients never apply broadcast contents
to game state. Channels remain public `game:<gameId>` channels for this demo.
Knowing a game URL intentionally allows viewing and subscribing; it grants no
seat ownership or bot-advancement rights.

## Delivery lifecycle

All game and seat mutation routes register `lib/realtime/schedule.ts` only after
a successful service mutation. The shared scheduler validates and copies the
compact envelope before registering a Next.js `after()` callback. The callback
awaits one publication attempt and channel removal. No response, seat assignment,
AI decision, repository, or game snapshot is captured.

Next.js `after()` keeps post-response work within the platform's invocation
lifetime. Vercel recommends it for Next.js 15.1 and newer:
[Functions API reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#usage-with-nextjs).
Delivery remains best-effort within the function's execution limit. Registration
and publication failures cannot turn a committed mutation into an HTTP failure.
There is no queue or retry.

The installed Supabase transport uses `channel.send(message, { timeout: 5000 })`
and its existing REST fallback for an unsubscribed server channel. Cleanup is
awaited in `finally`, including after failed sends. Logs contain only the phase,
event type, game ID, committed version when present, and elapsed milliseconds.
Raw errors, credentials, game contents, and provider responses are excluded.
The current SDK warns that its automatic REST fallback will be deprecated; a
transport migration is separate from this lifecycle change.

## Notification contract

Outgoing envelopes reject every additional field:

- Game events: `{ type, gameId, version }`, using the committed version.
- Seat events: `{ type, gameId }`, without a version.

Game event types are `game_updated`, `player_action`, `ai_decision`,
`hand_started`, `hand_completed`, `seat_count_updated`, `table_settings_updated`,
and `cards_revealed`. Seat types are `seat_claimed`, `seat_name_updated`,
`seat_released`, and `seat_bot_assigned`. Event names and channels are unchanged.
Mutation HTTP responses retain their existing data. Seat notifications require
no game read or projection; a public-directory join requires no extra assignment
lookup to publish its signal.

New clients accept compact envelopes and strictly validated legacy envelopes
with masked game/seat/AI payloads, normalizing both to compact refresh signals.
Matching seat events always refresh, including name changes that retain the game
version. Matching game events refresh only when newer than the current version
(or when no version is loaded). Unrelated or malformed events are ignored.

Existing 75 ms debounce, serialized/coalesced refetches, and polling are retained:
30 seconds when subscribed, 5 seconds when unavailable. Hidden/offline tabs pause
polling and refetch immediately on returning. Old open clients may reject compact
notifications and recover through polling until reloaded. New clients accept
legacy publishers during deployment overlap. No migration is required.

## Verification and payload measurement

Route lifecycle tests cover every publisher route: scheduling only on successful
mutations, unchanged HTTP responses before callbacks run, registration failures,
and delivery failures. Publisher tests cover exact envelopes, transport timeout,
cleanup, sanitized failure logs, and no seat-related database reads. Client and
refresh-coordinator tests cover compatibility, filtering, debounce and polling.

Run `npm run check` and `npm run build`, then the focused browser tests:

```sh
npm run test:e2e -- test/e2e/realtime.spec.ts test/e2e/bot-advancement.spec.ts
```

The Realtime smoke test uses two independent browser contexts, real WebSocket
frames and committed mutations. It requires compact game and same-version seat
notifications and visible refetched changes before polling. A blocked WebSocket
case verifies fallback polling. The separate spectator case checks bot-step 403s.

Run the same smoke check against a Vercel deployment **containing this change** (a preview, or a live
site explicitly authorized for smoke testing):

```sh
E2E_BASE_URL=https://your-preview.vercel.app npm run test:e2e -- test/e2e/realtime.spec.ts
```

`E2E_BASE_URL` skips local Supabase discovery and local server startup. These tests
create private demo tables on the supplied deployment. A passing local test or a
smoke check of an older deployed build cannot verify the changed Vercel lifecycle.
Record the tested deployment URL and revision with its result.

Reproduce UTF-8 JSON payload sizes with:

```sh
node scripts/measure-realtime-payloads.mjs
```

Synthetic six-seat flop fixture, one human plus five rules bots; old envelopes
include the fully masked game and the relevant AI decision/seat. Counts exclude
Supabase/HTTP/WebSocket framing:

| Event | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| `player_action` | 3,140 B | 85 B | 97.29% |
| `ai_decision` | 3,377 B | 83 B | 97.54% |
| `seat_name_updated` | 3,335 B | 76 B | 97.72% |

Durable queues, retries, provider deadlines, and polling changes are outside this
change.

## Verification record — 2026-10-04

Implementation commit: `20c12367b2872d0a71057b7c6b7a1fbe397ce471`, pushed to `main`.
`npm run check` passed: 52 files, 535 tests. The production build passed using
`NEXT_DIST_DIR=.next-e2e npm run build` to preserve the running development
server's output. All eight focused Chromium tests passed against local Supabase,
including actual compact delivery with browser timers frozen so polling cannot
satisfy the assertions, same-version name changes, fallback polling, and spectator
bot-step denial. The delivery case completed in 2.9 seconds.

The initial check of `https://ai-holdem.vercel.app` preceded deployment and
received legacy snapshots. After the user confirmed deployment of the implementation
commit, the same two-browser smoke suite passed on that live Vercel deployment:

```sh
E2E_BASE_URL=https://ai-holdem.vercel.app npm run test:e2e -- test/e2e/realtime.spec.ts
```

Both tests passed in 22.6 seconds. The actual-delivery case (13.4 seconds including
navigation) observed exact compact game and seat notifications over real Realtime
WebSockets, then refetched visible committed settings and same-version name changes
with browser polling timers frozen. The spectator's bot-step request returned 403.
The blocked-delivery case recovered the committed settings through fallback polling
(8.8 seconds including navigation). This completes the deployed response-lifecycle
smoke check; delivery remains best-effort within the function execution limit.
