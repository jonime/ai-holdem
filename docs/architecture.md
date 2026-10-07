# Architecture

Every application-owned JSON endpoint shares browser-safe, feature-specific
Zod contracts in `lib/http/*-contracts.ts` and named, runtime-validated client
calls in `lib/http/api.ts`. Public DTO types are inferred from those schemas;
ownership-aware server projections still control private data. The transport
preserves cancellation and cookies, keeps authoritative reads uncached, and
never retries mutations. HTML forms/redirects, Realtime messages and external
provider clients retain their separate boundaries. See the
[endpoint contract checklist](../CONTRIBUTING.md#http-contracts) for every route,
client method and verification requirements.

```text
browser -> Next.js API routes -> poker engine + bot providers -> Supabase
```

Each request applies at most one player action. Supabase RPCs atomically store
the resulting engine state and action record while enforcing the expected
game version. Bot decision inspection data is not stored.

## Human departure

Deploy `20261019000000_add_human_departures.sql` before application code.
Header Leave table and Stand up share `releaseSeat`, preserving the seat-response
contract and existing owner/host permissions. The server prepares any current-turn
fold through the adapter; `depart_game_seat_if_version` locks the game row, checks
version and ownership, registers leaving and commits at most one fold atomically.
Waiting/completed human seats release immediately. Bots retain their credit-departure
and next-hand reconciliation behavior. Durable hosts and usage attribution persist.

`POST /api/games/:gameId/advance-departure` accepts only `expectedVersion`. Host or
claimed human driver eligibility matches bot advancement, including folded and
eliminated seats. The server chooses the actor; the RPC rechecks driver eligibility,
version, actor identity and human leaving state under the game lock. It commits
one engine-validated fold without providers, allowances or claims. Ordinary human
actions consult current departure state and persist the actual fold, with an SQL
fence preventing non-fold commits for departing humans. Departure cannot be cancelled
by seat movement or returning during the hand.

The migration also reconciles previously completed human departures under game
locks with a version increment. An action-transaction trigger clears departing human assignments when games become
complete, including bot-completed hands. Engine participants, initial configuration,
awards and history remain intact. Completed public projections retain the participant's
identity and ownership-aware cards separately from live seat availability. The
optional public `poker.seats` summary carries current ownership/status/stacks for
navigation and next-hand controls; only the viewer’s own token is present. It
comes from the same authoritative snapshot, and legacy Broadcast schemas require
all seat tokens to be null. A new occupant cannot inherit completed-hand cards. New human claims get a fresh
engine identity and starting stack; moves of an already-owned seat retain identity. Voluntary
reveals authorize against immutable initial-hand ownership, not reassigned seats.
Only successful commits schedule compact wake-up signals through `after()`;
completion invalidates directory candidates. Realtime and polling retain fallback
behavior; no worker or disconnect timeout is introduced.

Run `npm run test:sql:departures` for rollback, identity, role and independent-connection
races, plus the production `departure.spec.ts` browser scenarios. Verify the two-browser
flow on an authorized Vercel preview before release.

## Debug history removal

Apply `20261018000000_remove_debug_history.sql` before deploying the debug-history
removal. It drops the inspection RPC, `ai_decisions` table (including existing
debug records), and its trigger function. Hands, actions, inference context,
claims, credit departures and reveals remain available. Legacy bot action RPC
inspection parameters are retained and ignored for rolling deployment
compatibility; the application sends null for inspection payloads.

## Bot advancement and Realtime

Only the host or a browser that owns a seated human player advances bot turns.
Folded and eliminated seated humans remain eligible; an unseated host can drive
a bot-only table. Other spectators are passive: Realtime and polling refresh the
table without requesting bot actions or offering bot retry. The server rejects
unauthorized `/step` requests with HTTP 403 before resolving a provider or
requesting inference. Bots pause when no eligible browser remains open.

Each browser runs at most one advancement loop, stopping at an ordinary human turn or hand
completion. Departing-human turns share this loop and use `/advance-departure`;
only bot turns acquire claims or resolve providers. Starting another hand still requires explicit interaction. Every
production step, including Equity Rules, requires an atomic Postgres claim after
caller authorization, expected-version and bot-turn checks, before provider
resolution, context preparation or inference. The service-role-only
`bot_step_claims` table holds at most one claim per game, cascading on deletion.
`acquire_bot_step_claim` locks the game row and creates/replaces an expired or
obsolete claim, or returns busy with a database-time expiry and bounded wait.
The 90-second lease exceeds the provider's 60-second deadline, is never renewed,
and holds no database transaction open during inference.

After preparing and validating context, external providers require atomic
[usage admission](fair-use.md). Database time and ordered allowance-key locks
reserve both durable host and game windows only while the claim remains valid.
A claim admission marker prevents duplicate charging; admitted failures are not
refunded. Rules turns consume no external allowance. All creation endpoints
share owner/IP admission before persistence. Denials preserve versions and bots,
release claims, and publish no success events.

`commit_bot_action_with_claim` and `commit_bot_departure_with_claim` lock the game,
verify the version, actor, token and unexpired ownership, call the existing
mutation, and consume the claim in the same transaction. Existing history,
reveals and credit-departure behavior remain intact. Lost tokens cannot commit.
A token-matched release runs in `finally`; cleanup failures never mask the original
error or invalidate a committed action. Expiry provides abandoned-request recovery.
Claim operations do not increment game versions or publish Realtime events, and
tokens remain internal and absent from DTOs, notifications and logs.

HTTP 409 `BOT_STEP_IN_PROGRESS` includes validated `retryAfterMs` (1–90,000).
Observing browsers stop posting and wait neutrally for existing Realtime/polling.
Advancement clears version-scoped waits and resumes eligibility-based stepping.
An unchanged version at the wait deadline displays a localized unfinished-turn
message and requires explicit retry, which refetches latest state and guards
duplicate clicks. Navigation or eligibility loss cancels timers. HTTP 409
`BOT_STEP_CLAIM_LOST` immediately refetches and offers explicit retry if the same
bot turn remains. Neither code is a provider failure. Provider errors remain
visible in the initiating browser; observers may wait until their deadline.
Version conflicts stop the stale loop and refetch silently; refresh failures stay
visible. No background worker, scheduler, general rate limiter or exactly-once
billing guarantee is introduced. Lease expiry can permit another inference after
a crash; fencing protects commits. Full deduplication requires old instances to drain.

Game updates use Supabase Realtime Broadcast as a refetch signal. Successful
mutations schedule one send through Next.js `after()` so publication and cleanup
survive the HTTP response within the function's execution limit. Sends use a
five-second timeout; scheduling or delivery failures preserve mutation success.
Strict game notifications contain only `{ type, gameId, version }` with the
committed version; seat notifications contain only `{ type, gameId }` and always
prompt a refetch, including same-version name changes. No game, seat, or AI
decision data is published. New clients normalize validated legacy payloads to
refresh signals; already-open old clients can recover through polling until
reloaded. See [Realtime architecture and verification](../plans/05-realtime-broadcast.md)
for payload measurements and local/Vercel smoke checks. No additional
SQL migration is required for Broadcast. The application intentionally uses public
game channels, so anyone who knows a game URL can subscribe; this is not an
authorization boundary for production. Broadcast is best-effort: a successful
database mutation remains successful when delivery is unavailable, and clients
always refetch authoritative HTTP state. Missing browser Supabase credentials
prevent the Realtime client from starting but do not expose server credentials.
Open tables also poll the authoritative game endpoint every 30 seconds while
Realtime is connected and every 5 seconds while it is unavailable. Polling
pauses in hidden or offline tabs, then refreshes immediately when the tab is
visible or online again.

## Public discovery

Hosts may publish a waiting lobby with an optional 60-character title. A visible
host lobby renews its two-minute database lease every 30 seconds; hidden or
disconnected lobbies expire from discovery without deleting the game and return
when the host comes back. The Play directory refreshes on explicit interaction, supports
cursor pagination, and only shows unstarted public tables with an open seat.
Directory joins and competing lobby mutations use the game row lock and an
expected-version check. The page keeps its stable heading and navigation in the
server-rendered shell and streams the visitor-specific directory through
Suspense. Shared, visitor-independent candidate pages use a three-second server
revalidation window; host/seated exclusions remain uncached and request-specific.

## Action-feed synchronization

Actions is the player-facing timeline on desktop and in the mobile sheet. The
browser initially loads the latest 50 hands, then requests `/feed?sinceHand=N`
from the last cached hand, inclusive. It replaces that hand and any newer hands,
retains older completed hands in memory, and keeps the combined feed bounded to
50 hands. Authoritative game refreshes drive synchronization, including catch-up
after reconnecting and retries after feed failures. Reloading fetches the recent
history again. Supabase Broadcast remains a refetch signal.

Public action identities are resolved by seat against each hand’s immutable initial
configuration. Legacy rows without usable identity return a null player ID and
are never matched by name.

## Consistent game-state reads and seat mutations

Game refreshes perform one uncached `get_game_read_snapshot` RPC rather than
separate game, seat, host, listing, and reveal requests. The `STABLE`,
`SECURITY INVOKER` SQL function reads those values in one statement snapshot;
only `service_role` can execute it. The snapshot stays server-side. TypeScript
restores the engine and applies viewer-specific cards, tokens, legal actions,
and host-only publication fields to the existing public response.

Both snapshot and mutation-response reveal queries filter by game ID and hand
number. A covering `(game_id, hand_number)` index bounds reveal work to that hand.
Reads are uncached so seat ownership, reveals, and lease renewals remain current,
including renewals that do not increment the game version.

With local Supabase running and all migrations applied, run `npm run test:sql:game-reads` and
`npm run benchmark:game-reads`. These use local credentials from the Supabase CLI,
create and clean up their own fixtures, and preserve existing games. See
[benchmark methodology and measurements](../benchmarks/game-reads.md). Unit tests
remain offline, and there is no latency threshold in CI.

Seat claims, bot assignments, and releases use versioned atomic RPCs through
`lib/poker/seat-service.ts`. Host permissions come from the durable host record,
including when the host is unseated; missing records grant no host authority.
Mutation responses parse the committed RPC seat row without rereading seats.
Run `npm run test:sql:seats` with migrated local Supabase, Docker, and Supabase CLI
to check locking, conflicts, retries, moves, permissions, release states, and
atomic bot credit departures (including rollback after departure failure) using
isolated fixtures. See [contributor testing instructions](../CONTRIBUTING.md).

See [deployment prerequisites](deployment.md#migration-prerequisites) for the
required database migrations.

## Quick Play endpoint

Quick Play atomically creates an already-playing private six-seat game with
five bots selected from the available Equity Rules, TypeSafe Jev, and configured
LLM catalog. Rules and Jev use medium difficulty; LLM seats receive random
server-owned playstyles. With external inference disabled, only Equity Rules
bots are selected.

`POST /[lang]/quick-game` accepts `Accept: application/json` and returns
`201 { gameId }`, with the existing identity and last-visited cookies. Unsupported
locales return 404; creation failures return 500 with a sanitized `{ error }`.
Homepage forms retain the 303 localized redirect and plain-text errors. Replay
creates a distinct private six-seat table using server-selected random Quick Play
bots (rules bots only with external inference disabled), and fully navigates there.
Repeated clicks are guarded while “Starting…” is shown. Failure keeps the current
table intact and displays a localized retryable error without automatic retries.
Replay never resets stacks, releases seats, or moves other players; watching deals
only on request.

## Private bot decision context

Jev and LLMs share server-owned decision facts and exact sizing. The uncached,
service-role-only `get_bot_hand_context` RPC returns one hand’s immutable initial
state and ordered persisted pre-action states plus the current game version.
Local replay resolves actors by engine turn and initial configuration, then
projects only visible action facts. Version/replay conflicts stop before
inference; legacy gaps are explicitly unknown and DB errors remain visible.

LLMs receive selected original advisory guidance in their system instructions.
Facts, advice and policy have independent versions. Provider context, raw
responses and decision diagnostics are not persisted. Candidate
safeguards, authorization, one request per decision, and version-checked
persistence are retained. See [context and evaluation methodology](../benchmarks/poker-context.md)
for position, sizing, pressure and research assumptions.

Provider failures normally keep the public generic 502 response. A confirmed
LLM credit failure instead applies one engine-validated fold and atomically marks
the seat leaving using `apply_ai_action_and_leave_if_version`. Apply
`20261014000000_add_atomic_bot_credit_departure.sql` before deploying the code.
The existing next-hand reconciliation removes the seat; current-hand results
and all-in settlement remain authoritative. The successful response carries
the fixed `llm_credit_limit_exit` matched rule, which displays a localized notice.
The fallback records no raw provider response or invented probabilities.

OpenRouter's [credit-limit contract](https://openrouter.ai/docs/api/reference/limits)
uses 402 with `openrouter_key_limit` or `openrouter_credits`. Plain 402 without
a `Retry-After` header also uses the credit fallback. A 402 with
`openrouter_in_flight_budget`, an unknown limit source, or an unclassified 402
with a `Retry-After` header,
remains paused; 429 and other provider errors never trigger departure. Error
envelopes carried in HTTP 200 are classified using their numeric error code.
Jev credit exhaustion is undocumented, so Jev failures remain paused.

TypeSafe and LLM requests use the same server-only helper with one 60-second
deadline spanning response headers and JSON body consumption. Expiry aborts the
request, including an active body read, and every outcome clears the timer.
Failures carry explicit `timeout`, `network`, `rate_limit`, `invalid_response`,
or `provider` categories. HTTP 429 and the supported numeric embedded code 429
identify rate limits; message text does not. Malformed successful JSON and
invalid decisions are invalid responses; malformed error JSON retains its HTTP
classification. Body-read timeouts remain timeouts even on HTTP 402 and cannot
retire a seat. Network errors and invalid responses cannot retire seats either.

The step API retains HTTP 502 and `AI decision failed`, adding `BOT_TIMEOUT`,
`BOT_NETWORK_ERROR`, `BOT_RATE_LIMITED`, `BOT_INVALID_RESPONSE`, or
`BOT_PROVIDER_ERROR`. The existing typed transport preserves these codes in
`HttpError`. Every locale has server-owned pause/retry messages; uncoded or
unknown errors keep the existing fallback. The client pauses the failed
hand/actor turn, including version-only changes and polling, and records every
attempted version in multi-step loops. Explicit Retry refreshes authoritative
state before inference and holds a synchronous pending guard through refresh
and stepping. Authorization, session/navigation guards and version checks remain
in force; competing commits still refresh silently. There are no automatic
retries, fallback poker actions, new provider settings, or schema changes.

In Vercel runtime logs, search for `llm_provider_http_failure` or
`typesafe_provider_http_failure` to find structured LLM or Jev HTTP failures:
game ID, fixed reason, allowlisted category, request phase (`headers`, `body`,
`response`) and elapsed milliseconds when available, HTTP status, numeric provider error code (100–599),
numeric `Retry-After` seconds when supplied, its presence (including date-format
headers), and boolean `creditMentioned`,
`quotaMentioned`, and `rateLimitMentioned` indicators derived from the provider's
error message. These indicators are clues, not proof of exhausted credits;
unknown/non-JSON bodies still log their HTTP status. The allowlisted `limitSource`
helps distinguish OpenRouter credit caps from temporary spending holds. A committed
credit fold includes `outcome: "fold_and_leave"`; failed/stale commits never claim
that outcome. Other bot failures use
`bot_decision_failed`. Logs never include raw provider messages, inputs,
responses, headers, keys or cards. LLM passive actions require null
sizing; their schema advertises only null when no aggressive action remains.

## Play and personal table discovery

`/[lang]/play` streams personal tables and the public directory through independent
Suspense request-time boundaries. Cookies are read only inside those boundaries.
The cached landing page links to Play and retains its anonymous Quick Play form.
Localized `/join-game` permanently redirects to `/play` in the same language;
English uses unprefixed URLs through `app/(english)` wrappers that reuse
the shared locale pages, layouts and POST handlers with `en-US` params. Old `/en-US` URLs permanently redirect to unprefixed equivalents.
Other locales retain their prefixes; browser language never redirects pages.
Play is `noindex, follow`
and excluded from the sitemap. No polling or Realtime runs on Play.

The service-role-only `list_my_games(text)` RPC unions durable host ownership and
claimed human seat ownership before sorting by `games.updated_at DESC, id DESC`
and limiting to five. It returns only ID, public listing title, status, timestamp,
and counts from actual seat assignments. Completed and error games remain visible;
the game route still decides permissions and next-hand eligibility. No visitor history,
last-visited cookie, local storage, snapshots or provider records authorize discovery.

`GET /api/games/mine` reads only the identity cookie, creates no identity when absent,
and sends `private, no-store` on success and failure. Its summaries are defensively
validated against browser-safe contracts and never logged or shared-cached. Deploy
`20261017000000_add_my_games.sql` before application code; it adds the RPC and
host-token/claimed-human-seat indexes without changing existing rows.
