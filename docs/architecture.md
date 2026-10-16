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

## Database contracts

`lib/supabase/database.generated.ts` is the unchanged Supabase CLI 2.120.0 output
for the fully migrated local `public` schema. Server clients use a database type
derived from it; the browser Realtime client keeps its existing boundary.
`GameDatabaseClient` carries generated RPC name/argument relationships and table
insert/update/filter types through the repository and focused test doubles.
Usage admission shares those generated function arguments. Response data remains
`unknown` at the testable repository boundary so malformed database responses
continue to be parsed and rejected.

The server-only `lib/supabase/contracts.ts` refines SQL-supported nullable function
inputs that the generator cannot express, and structured JSON payloads. Timer
commits discriminate the SQL wrapper's allowed operation names and corresponding
RPC arguments. Duplicate-safe creation binds admission metadata and nested
`create_game_session` arguments; creation players derive from table columns,
timer transitions from adapter facts, and departure folds from the existing
domain contract. Unknown persisted state crosses JSON inputs through checked
serialization using the same JSON semantics as Supabase, including omitted
undefined object fields. Generated `Json` and these compile-time contracts do
not validate poker state or result envelopes; runtime parsing, engine validation,
SQL permissions, ownership/privacy filtering and version checks remain required.

The integration job compares freshly generated local types after migrations and
before SQL tests. After SQL checks, a dedicated local bot-pipeline suite uses
production creation, context parsing, claimed stepping, allowance admission and
persistence with an injected deterministic `BotRegistry`. It runs with sanitized
local credentials and loopback-only networking, then removes fixture-owned
games and counters. Provider HTTP and playing strength remain outside this
coverage; see CONTRIBUTING.md for the command and isolation boundaries.
The fast job compiles committed types without Docker. See
[the contributor workflow](../CONTRIBUTING.md#database-contracts) for regeneration
and prerequisites.

## Poker service boundaries

`lib/poker/bot-turn-service.ts` owns bot authorization, claims, history/context
validation, usage admission, inference and token-matched persistence. Production
routes call only `stepBotAction`; the decision/commit pipeline is private.
`stepTypesafeAction` remains a claim-free legacy test seam and is never used by
production routes. The entry point authorizes and checks the version before
provider resolution, acquires a claim before context preparation, then the
claimed pipeline rereads and revalidates the game before inference.

`lib/poker/game-service.ts` owns creation, settings, human actions, feeds, hand
transitions, departures and timeouts. Neither service imports the other.
`driver-authorization.ts` shares host/owned-seat driver authorization and the
single `BotStepForbiddenError` definition across bot turns, departures and
timeouts. `game-errors.ts` owns `GameNotFoundError`; `persisted-state.ts` restores
and validates persisted engine state. `game-projection.ts` shares seat
placeholders, viewer privacy filtering, hand-scoped reveals and timer response
fields. `game-service-contracts.ts` holds dependency-neutral repository
interfaces; bot-specific interfaces stay with the bot service. These shared
modules import neither service and do not resolve providers. Response types
continue to come from the existing HTTP contracts.

## Human departure

Deploy `20261019000000_add_human_departures.sql` before application code.
The header selects Leave table only for an owned non-departing human with another
claimed human seat; otherwise Lobby navigates directly and preserves seats.
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
survive the HTTP response within the function's execution limit. The server uses
explicit REST delivery through `channel.httpSend()` without subscribing to a
WebSocket channel, checks its `success` result, and awaits channel removal. Sends
use a five-second timeout; scheduling or delivery failures preserve mutation success.
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

`useGameSession` exposes a structured connection notice: none, offline,
reconnecting, or refreshFailed. Offline takes precedence; online events retain
reconnecting until a current-session authoritative game read passes reconciliation.
Failed reads (including timeout) stay visible during retries. Equal versions are
valid successes; ignored late responses, subscriptions, feed and catalog reads
cannot clear failures. Navigation resets feedback and fences pending reads by
session generation. Read activity disables the single shared Refresh table action;
manual requests use the existing serialized coordinator. The stable polite status
region announces message changes only. Mutation recovery retains its unknown-outcome
explanation, while independent provider/allowance notices and explicit retries remain.
Connection feedback changes no mutation eligibility, bot policy or request deadline.

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

Optional browser preferences never gate rendering or server mutations.
`lib/browser/player-name.ts` shares hydration-safe name reads, guarded writes,
in-memory snapshots and same-tab/cross-tab subscriptions between Play and the game.
Its cache exists only for browser windows; server snapshots are always empty.
Failed writes retain the latest memory value instead of rereading stale storage.
Game drafts remain separate from the preference and server-owned seat names.
Claims save before the request; renames save only after success.
`useActionsPreference` starts with the same server/client render and loads storage
and the responsive default after hydration, without replacing an early user action.
It persists booleans best-effort outside rendering and state updater callbacks;
it adds no resize or cross-tab synchronization. Settings storage-event filtering
also guards access to the storage object. The browser Broadcast client uses the
already lockfile-installed `@supabase/realtime-js` transport with the same public
key and WebSocket endpoint, avoiding Auth's module-level storage debug read. Identity cookies and duplicate-safe
creation session-storage recovery retain their separate safety behavior.

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

## Game route loading failures

Locale resolution and server-owned dictionaries precede the game layout's
Suspense boundary. Both game-ID segments also provide `loading.tsx`, creating
segment-local Suspense boundaries around `GamePageContent` for refreshes and
navigation when Next.js reuses the shared parent layout. These fallbacks render
`TableRouteLoading`, which receives the server-owned dictionary through the
parent I18nProvider and uses the same neutral shell. The parent boundary alone
is insufficient for development instant-navigation validation of live reads.
Its prerendered `TableLoadingShell` preserves the header's
branding and dimensions and the page background. Header controls reserve invisible
space until the client app is ready. The shared `TableLoadingIndicator` also
covers the initial browser fetch: a small CSS spinner and localized, accessible
loading status centered in the available space below the header. Reduced motion
disables spinner animation. No felt, seats, controls or Actions skeleton appear
before authoritative data; there is no artificial delay or minimum display time.
The server existence check and browser snapshot read remain uncached; subsequent
refreshes retain the current screen. Waiting tables transition into the lobby;
active and completed tables render their actual layout with Actions open by
default on desktop, respecting saved desktop preferences, and the Actions modal
closed on mobile. Partial prerendering and Next.js 16.3.8 remain unchanged;
framework upgrades and Partial Prefetching adoption are separate changes.

The localized and unprefixed English game segments share branded missing-table and
render-error fallbacks under the game layout’s I18nProvider. Malformed UUIDs are
rejected before constructing the repository; only GameNotFoundError uses
Next.js notFound(). Repository failures remain render errors. Streaming is
preserved, so a missing-table response can have HTTP 200; game metadata retains
noindex. Missing-table guidance does not assume deletion.

The render-error fallback exposes an explicit Next.js boundary retry(), which
refetches and rerenders the current segment with its locale, query and identity
cookies intact. Pending retries are guarded; repeated failures leave the fallback
usable. Error details are never rendered or logged by the fallback. Layout
failures and unrelated unmatched routes are outside this boundary. These initial
render failures are separate from in-game request recovery and the terminal
removed-table state after loading; those workflows remain unchanged.

Unmatched URLs use `app/global-not-found.tsx`, enabled by Next.js’s experimental
`globalNotFound` option because the app has separate English and localized root
layouts. This static server-rendered document returns HTTP 404, uses English
fallback copy and an unprefixed Lobby link, and shares the table failure panel’s
styles. It imports global styles directly because the global boundary bypasses
layouts. Next.js adds `noindex`; the game-specific missing-table boundary remains
localized.
The root `app/not-found.tsx` reuses the document for invalid locale segments
rejected with `notFound()` before a root layout can render.
The localized landing page exports `instant = false` because unknown first path
segments also match `/[lang]`. This allows the root layout to reject invalid
locales before streaming with HTTP 404, without development instant-navigation
validation errors. Supported locale landing pages remain cached and prerendered
through `generateStaticParams` and `use cache`.


## Duplicate-safe creation

Enhanced creation supplies an optional UUID `creationAttemptId` through the typed
custom JSON API or Quick Play JSON path. Plain forms and bodyless callers retain
legacy admission/persistence. `creationAttemptArguments` hashes normalized mode,
sanitized name and accepted settings; locale, randomized bot selections and cards
are excluded. Owner scope uses a domain-separated SHA-256 cookie-token hash,
independent of IP and the rotating allowance HMAC secret. Cookie ownership remains
anonymous seat ownership, not authentication.

`create_game_with_attempt` takes a transaction advisory lock for owner/attempt,
returns an existing result before admission, and rejects different intent with
`CREATION_ATTEMPT_CONFLICT` (409). New attempts charge owner/IP allowance, call
existing `commit_with_turn_timer`/`create_game_session` persistence, and record the
result in one transaction. Failures roll back charge and record; denials create
neither a game nor an attempt. The service-role-only `creation_attempts` table retains
completed records indefinitely. Deletion nulls its game foreign key, preserving a
permanent tombstone returning `CREATION_ATTEMPT_UNAVAILABLE` (410). Retention changes
require a separate design preserving replay safety. Legacy entry points remain for
rolling deployment. Never log attempt IDs, fingerprints, names, tokens or payloads.

The shared progressive controller establishes the existing five-year, path `/`,
SameSite=Lax ownership cookie client-side when absent and reads it back before
submission. Cached HTML contains no user identity or attempt ID. It records inputs
and a browser SHA-256 identity fingerprint in session storage, with memory fallback,
uses a 15-second header/body deadline, and fences late results on navigation. Explicit
retry reuses captured inputs/ID; reload only offers recovery. Identity changes stop
replay. An acknowledged JSON success clears the record and navigates.

## Equity Rules policy boundary

`ServerBotRegistry` resolves the existing `equity-rules-v2` catalog entry to
`OpeningAwareEquityRulesBot`. This wrapper first computes the unchanged
`EquityRulesV2Bot` baseline and applies only the confirmed medium-KK fold-to-3-BB
opening rule. The guard requires preflop/no board, complete empty/unopened history,
UTG, five active opponents, zero hero street investment and equal 100-BB initial
stacks reconstructed from remaining stacks plus positional blinds. Missing or
out-of-bounds target raises fail visibly; sizing is never clamped to another
candidate. Diagnostics follow the existing exact-amount sizing convention.
The engine validation/commit path still decides legality. QQ, equity sampling,
seeds, all other baseline decisions and provider contracts are unchanged.

The historical baseline class and strategy remain directly available to frozen
benchmarks; production selection belongs to the registry. See the
[promotion review](../benchmarks/preflop-candidate/promotion-review-2026-10-16.md).
The completed source/data bundle preserves reanalysis independently of later live
source changes; recovery commands are in the
[benchmark guide](../benchmarks/preflop-candidate/README.md#preserved-baseline-reanalysis).

## Quick Play endpoint

Quick Play atomically creates an already-playing private six-seat game with
five bots selected from the available Equity Rules, TypeSafe Jev, and configured
LLM catalog. Rules, Jev and opt-in Eevo use medium difficulty; LLM seats receive random
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

`lib/systemone/` owns provider-neutral request types, candidate construction,
response validation and difficulty sampling. `lib/bots/systemone.ts` prepares
sanitized context/advice and extracts diagnostics for both Jev and Eevo. Both retain
the `typesafe-poker-v4.0` base questions and exact river safeguards. The production
registry wraps Jev with `ConfidenceAwareJevPokerBot` (`typesafe-poker-v4.1-confidence`)
and Eevo with `ConfidenceAwareEevoPokerBot` (`eevo-poker-v4.1-confidence`).
Jev keeps `jev-latest`; Eevo uses
`eevo-1` at the fixed `https://eevo.io/api/v1/systemone` endpoint with its own
Bearer secret and allowlisted request/response errors. No native consequence or
stakeholder API is used. Missing cost remains null. Compatibility exports in
`lib/typesafe/` preserve existing callers and frozen earlier benchmark policies.

Eevo's descriptor is always resolvable for existing seats/history. New selections
require a configured `EEVO_API_KEY` and external inference enabled. Quick Play
filters it out unless `EEVO_QUICK_PLAY_ENABLED=true`, then includes it in provider
diversity selection. It has difficulty controls and no LLM playstyles.


Jev, Eevo and LLMs share server-owned decision facts, exact sizing and selected original
situational advice. The uncached, service-role-only `get_bot_session_context` RPC
returns the current hand plus the latest 50 completed hands before it, bounding
hands in SQL before fetching actions. A single stable SQL statement binds every
component to the same game version. Deploy `20261028000000_add_bot_session_context.sql`
first; it is additive and needs no backfill. Equity Rules keeps the existing
`get_bot_hand_context` read and its legacy context/strategy.

Server replay validates the current hand against the decision state and every
historical hand against its completed final engine state. Actor resolution uses
engine turns and immutable initial participants. Version/replay conflicts stop
before inference; missing legacy states/gaps produce explicit incomplete coverage,
and database/malformed-state failures remain visible. Authorization and the bot
claim precede history preparation; claim verification and allowance admission
still precede the provider request. Provider-specific output contracts are unchanged.
Historical bot descriptors accept and preserve optional catalog `configuration`
booleans (`difficulty` and `playstyle`), including those persisted by Quick Play.
Legacy descriptors may omit them; malformed metadata and unknown descriptor fields
remain rejected.

Only compact `sessionStats` aggregates leave the server. They contain seat-relative
hero/opponent roles, separate dealt-heads-up and dealt-multiway buckets, action counts,
opportunity denominators, rates (null at zero opportunities) and evidence labels.
Voluntary preflop participation/raises use one opportunity per participant-hand
with a recorded preflop decision. Heads-up button opening outcomes and BB responses
to opens up to 3 BB versus larger opens use their first relevant decisions.
Postflop aggression counts each decision with a legal bet/raise; faced-bet folds
count decisions with a legal call and an outstanding price, separately by street.

Continuity requires immutable engine identity plus a human ownership token, or the
complete bot descriptor/difficulty/playstyle, across consecutive validated hands.
Names and seats never establish identity. A missing participant, uncertain record,
hand gap or configuration/ownership change stops older attribution. Identifiable
forced-departure participant-hands are conservatively excluded; other folds are
recorded actions without guessed intent (historical timers and some credit folds
lack durable provenance). Historical cards, private states, IDs, tokens and outcomes
never enter aggregate context. There are no cross-table profiles or notebooks.

Facts (`poker-facts-v1`), advice (`poker-advice-v2`), session statistics
(`poker-session-stats-v1`) and provider policies (`typesafe-poker-v4.0`,
`llm-poker-v4.0`) have independent versions. Fewer than ten opportunities are
insufficient for opponent-specific adaptation; this is a conservative product
default, not a statistical guarantee. Larger samples remain uncertain evidence,
including hero table image; repeated folds never create an obligation to call.
Dealt-player count, current remaining players and pending actors are distinct.
Originally larger tables with two dealt players receive heads-up opening guidance;
a multiway hand reduced to two retains its original preflop context. Advice never
removes candidates or overrides legality, exact river safeguards or playstyles.

Production Jev and Eevo additionally receive the same server-only `jev-opponent-advice-v2`
from `lib/poker/opponent-advice.ts`. Relevant fold observations need at least ten
opportunities; a two-sided 95% Wilson lower bound >0.60 describes frequent folding,
and an upper bound <0.30 describes frequent continuation. Other intervals add no
tendency guidance. Use dealt-heads-up versus multiway buckets, match the street,
and name only an active opponent still able to fold. Preflop BB evidence applies
only to a heads-up button's unopened pot and the indicated normal opening-size
bucket; all-in candidates never receive opening-bucket tendency advice.

Production text differs from the experimental v1 advice: pressure does not imply
larger bets; historical fold counts are not a current-action fold probability and
cannot justify oversized or all-in commitments. Prefer ordinary pot-relative
sizing; a large commitment needs independent hand/stack/price justification. Seek
worse continuing hands for value rather than automatically reducing value bets.
All action/sizing candidates remain available; this is qualitative advice, not an
action override. Both wrappers use one provider request and preserve difficulty,
claims, allowance admission, deadlines and public privacy boundaries. LLM and
Equity Rules behavior is unchanged. The advice version retains its historical Jev
name; Eevo uses the exact same advice and sizing caveats through the shared envelope
builder. Eevo retains its own endpoint, key, model and error mapping.

The original `JevPokerBot` wrapper remains the reproducible base for benchmarks.
The paid pilot showed behavioral sensitivity but concerning extreme sizes; the
production wording revision and Eevo extension are offline-tested, not
paid-validated strength improvements. See the [promotion record](../benchmarks/opponent-advice/production.md).

Provider context, raw responses and decision diagnostics are not persisted or
exposed through public DTOs, browser APIs or Realtime. Production model settings
remain unchanged. See [context and evaluation methodology](../benchmarks/poker-context.md)
for qualitative strategy limits and the bounded OpenRouter model pilot.

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
Jev credit exhaustion is undocumented, so Jev and Eevo failures remain paused. Eevo never uses LLM credit departures.

TypeSafe, Eevo and LLM requests use the same server-only helper with one 60-second
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
`typesafe_provider_http_failure` or `eevo_provider_http_failure` to find structured LLM or Jev HTTP failures:
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

## Application failure logging

Server game, seat, discovery and creation route failure branches use
`lib/logging/application-failure.ts`. `logApplicationFailure` emits a single object
with exactly `event: "application_request_failed"`, an allowlisted `operation`,
a server-generated UUID `requestReference`, fixed `category`, and numeric HTTP
`status` (400–599). The reference is generated at logging time and stays internal.
`classifyApplicationFailure` selects `invalid_data` for Zod errors, `poker_rule`
for engine rule errors, `usage_unavailable` for usage admission outages, and
`unexpected` otherwise, without reading exception properties. Recognized classes
that reach an existing failure branch retain its HTTP response; categories do not
change status or handling. Expected validation, missing-game, authorization,
conflict and usage-denial branches return before this logger. Personal-table
reads intentionally remain silent.

The logger accepts no metadata and rejects extra or invalid fields silently.
Validation, UUID generation and sink failures never replace the original response.
It never serializes exceptions, stacks, causes, arbitrary messages, request data,
URLs, headers, cookies, identities, cards, or provider/database payloads.
Provider failures continue through `lib/bots/provider-logging.ts` without a generic
duplicate. Realtime publishing/scheduling retain their compact identifiers,
phases and timing; bot-claim cleanup retains its fixed notice. Browser Realtime
failures log fixed text without exception data or table identifiers.

Search server runtime logs for `application_request_failed`, filter by operation
or status, then use the exact `requestReference` UUID to locate that event. The
reference is absent from HTTP responses and is not propagated into service,
provider or publication logs; it cannot correlate an entire request lifecycle.
This covers application-authored diagnostics only. Automatic framework and
hosting logs are outside this boundary. There is no external monitoring service,
database migration, feedback integration or response-contract change.

## Play and personal table discovery

`/[lang]/play` streams personal tables and the public directory through independent
Suspense request-time boundaries. Cookies are read only inside those boundaries.
The cached landing page links to Play and retains its anonymous Quick Play POST form with client-only progressive enhancement.
Localized `/join-game` permanently redirects to `/play` in the same language;
English uses unprefixed URLs through `app/(english)` wrappers that reuse
the shared locale pages, layouts and POST handlers with `en-US` params. Old `/en-US` URLs permanently redirect to unprefixed equivalents.
Other locales retain their prefixes; browser language never redirects pages.
Play is `noindex, follow`
and excluded from the sitemap. No polling or Realtime runs on Play.

The service-role-only `list_my_games(text)` RPC unions durable host ownership and
claimed human seat ownership before sorting by `games.updated_at DESC, id DESC`
and limiting to five. It returns only ID, public listing title, status, timestamp,
version, removal capability, and occupied/total, human and bot counts from actual seat
assignments, plus `viewerSeated`. Claimed humans include departing/eliminated assignments;
bots count only occupied assignments. Counts must sum to occupied seats, stay nonnegative,
and `viewerSeated` requires at least one human. No names, tokens, cards or gameplay
snapshots are returned. The repository makes one RPC without per-game queries. Completed and error games remain visible;
the game route still decides permissions and next-hand eligibility. No visitor history,
last-visited cookie, local storage, snapshots or provider records authorize discovery.

`GET /api/games/mine` reads only the identity cookie, creates no identity when absent,
and sends `private, no-store` on success and failure. Its summaries are defensively
validated against browser-safe contracts and never logged or shared-cached. Deploy
`20261017000000_add_my_games.sql` before application code; it adds the RPC and
host-token/claimed-human-seat indexes without changing existing rows. Apply
`20261026000000_add_personal_summary_composition.sql` before the matching application:
it replaces `list_my_games` with the extended return signature, retaining membership,
private exclusions before the five-item limit, deduplication, ordering and removal rules.
There is no compatibility RPC. Client activity labels use the app locale with
`Intl.RelativeTimeFormat`, a hydration-safe absolute UTC initial value, and exact UTC
accessible labels/tooltips. They recompute on mount, new summaries and visibility return,
without polling, subscriptions to table events, presence tracking or repeating timers.

## Human turn timer transactions

`humanTurnSeconds` is nullable (Off) or 30/60/90. Configuration is stored in the
engine-independent config and `games.human_turn_seconds`. Adapter `timerTransition`
reads dealt participants and the next actionable actor. `commit_with_turn_timer`
locks the game row and invokes an allowlisted existing mutation, preserving its
history, awards, reveals and departure cleanup. A games trigger writes a fresh UUID
decision ID, actor ID, hand number and deadline from database time within that same
transaction. Hand eligibility freezes when the hand starts, including solo
suppression. Version-only changes retain the deadline and decision ID. Legacy
engine writers without transition facts fail closed on configured timed games.

`POST /api/games/:gameId/advance-timeout` accepts `{ expectedVersion, decisionId }`
and returns the standard game envelope. Hosts and owned seated humans can drive it;
spectators cannot. The service prepares one adapter-validated check or fold. Under
the same lock SQL rechecks driver authorization, decision, actor, hand, version and
deadline. Early requests return `TURN_NOT_EXPIRED` (409) plus `retryAfterMs`; normal
human submissions at/after expiry return `TURN_EXPIRED` (409). Conflicts refresh
silently. Departing actors retain fold precedence. No claims, providers or inference
allowances are used for timeouts.

Game responses include nullable `turnTimer` and `serverTime`. The single-snapshot
read includes statement-time from PostgreSQL; reads never initialize deadlines.
The existing lifecycle schedules one timeout attempt and shares mutation, generation,
navigation and response-order guards with bot/departure advancement. Display timing
uses accepted server samples plus `performance.now()` elapsed time. Failures pause
until explicit retry; early requests wait for the server-supplied interval. No worker
or next-hand automation exists.


## Personal completed-hand result

`startHand` captures actual engine seat stacks before forced bets for dealt
participants, keyed by immutable player ID in optional `handStartStacks` persisted
JSON metadata tagged with the hand number. Adapter actions and seat transitions
preserve it; starting the next hand replaces it. Restore accepts legacy or malformed
optional metadata without blocking gameplay. Projection validates the complete
baseline as nonnegative safe integers and requires the current hand number.
Missing, malformed, mismatched or missing-viewer entries suppress the result.

The public contract adds nullable `viewerHandResult` (`startStack`, `endStack`,
`netChange`), with omission parsed as null. Only a token-resolved human participant
in the completed hand receives it, including released participants through retained
immutable ownership. The adapter finds the settled engine seat by player ID and
subtracts the pre-blind baseline; pot awards are independent. Spectators, bots,
nonparticipants and active hands receive null. Raw baselines stay server-side;
legacy Broadcast envelopes require the personal result to be absent or null,
and compact refresh signals are unchanged. No migration, backfill, history
reconstruction or additional database read is required. The localized summary
precedes awards, uses text for gain/loss/break-even, survives refresh/feed failures,
and clears at the next hand without new controls or notifications.

## Public winning five

The shared adapter projection adds nullable `players[].winningHand` containing
exactly five card identifiers and `playsBoard`. Missing fields parse as null for
legacy response compatibility. Reads and mutation responses use the same projection;
no migration or additional request is needed. Only recorded positive pot recipients
at completed showdowns with non-folded, publicly revealed hole cards and sufficient
engine evaluation data receive it. Active hands, hidden/folded players, fold-ended
wins and incomplete legacy data return null.

The adapter uses the installed engine evaluator to select the best five from the
public board and that recipient's revealed hole cards, validates their membership,
and retains evaluator order. If the board evaluates equally, it returns the board
in board order with `playsBoard: true`. It never recalculates winners or awards.
The HTTP boundary validates five distinct card identifiers and the boolean; no
ranks, evaluation inputs or new ownership identifiers are exposed. The result panel
renders authoritative awards independently of the Actions feed, marks hole-card
sources accessibly, stacks different recipients under Pot awards, and clears with
the next hand while preserving result scrolling and next-hand controls.

The public player `currentHandCategory` defaults to null for omitted legacy fields. The engine adapter reuses its visible-card evaluator with exactly the owned human participant’s two hole cards and the currently revealed board on flop/turn/river. It requires participation without folding or departure; all-ins qualify. Preflop, completion, spectators and other participants receive null. Shared projection applies this equally to reads and mutation responses. No persistence or migration is needed. Legacy Broadcast permits only absent/null categories; compact notifications remain unchanged. Seat renders receive explicit viewer identity on desktop and mobile. The display-only `showCurrentHand` version-1 Settings preference defaults to true, uses existing hydration/storage synchronization, and does not affect server projection. Every seat reserves an aria-hidden empty category slot even with the preference disabled. Status/action text is absolutely positioned on the bottom border; equal fixed seat dimensions keep category/status updates out of table sizing. Showdown categories use the same slot and winner amounts share the border badge. Category changes have no live region, sound or animation.

## In-game Help content

Each supported locale has a complete Markdown-authored document in `content/help/`
with an exported localized `title`. The explicit locale map in `lib/help/server.ts`
is server-only and reuses the installed MDX configuration. The shared game Server
Component loads only the selected locale and passes rendered content and its title
into `PokerApp` through a React-node slot; unprefixed English routes use the same
component with `en-US`. Client modules never import help documents or fetch them
at runtime. Only Help and Close help interface labels live in game dictionaries.
Localized Help imports the server-only `InlineCardExample` for text-sized ranked
hands, the royal flush and suit legend. Suit-marked spans share
`SuitColour.module.css` with visible `PlayingCard` faces and inherit suit variables
from the `PokerApp` wrapper, which contains the table and every overlay. The
version-1 browser settings codec defaults a missing `cardColours` to `classic`;
post-hydration loading switches the wrapper palette without game or HTTP changes.
No document-wide style mutation or client Help provider is needed. Four-colour
blue (`#1856a0`) and green (`#21633e`) maintain at least 4.5:1 text contrast on
card (`#fffdf6`) and Help (`#f8f7f0`) backgrounds.
The single overlay state includes Help and bot information, using the shared native
`Modal` lifecycle. Bot information stores an immutable participant ID and resolves
only the latest `poker.players` public metadata. It closes when that participant
is removed or ceases to be a bot. Native seat-name buttons restore focus on close;
Help is the fallback if the opener disappears. Opening performs no requests or
catalog lookup, and does not affect timers, bot advancement or session recovery.
Concise provider and supported configuration descriptions live in server-owned
game dictionaries and agree with About MDX; no inference details are exposed.

The same overlay state owns Leave table confirmation. `ConfirmationDialog` wraps
`Modal` with Cancel-first focus, a synchronous submission/dismissal guard and
announced progress; callers retain API ownership. PokerApp resolves the current
owned seat and phase on every render and uses the existing session departure and
recovery flow. MyTables stores only the selected ID, title and intended operation,
looks up the current row version at submission, and reconciles conflicts or
unknown outcomes once. It latches changed operations until reopening and blocks
submissions after failed reconciliation until an explicit refresh succeeds.
Abort signals and lifecycle generations fence unmounted list requests. The stable
Play heading receives focus when the original removal button disappears.

## Feedback link

The shared locale layout renders a plain external feedback link using server-owned
labels from the landing-server dictionaries. Its public URL is centralized in
`lib/constants.ts`; no environment variable is needed. `target="_blank"` and
`rel="noopener noreferrer"` keep the game tab open and suppress the referrer
(including game URLs). The app loads no Tally script, iframe, or cookie and appends
no player identity, game state, or tracking parameters to the form URL.
