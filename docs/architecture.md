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

## Personal table results

`GET /api/games/[gameId]/results` is cookie-owned and `private, no-store`. The strict
`results-contracts.ts` DTO and named `api.games.results` transport return only
summary counts, coverage flags, chip/BB totals and highlight hand numbers/amounts.
No identity, private state, cards or other player's results leave the server.
Unexpected failures use allowlisted `results` logs and `games.results` diagnostics.

`get_personal_results_page(uuid, integer, integer)` is service-role-only and reads
completed initial/final states without actions in ascending keyset pages of 100.
The first SQL statement fixes an upper boundary from completed history and the
game's completed-hand number; subsequent pages carry it unchanged. Gaps count as
excluded hands with unknown ownership. An intermediate read or malformed page
fails the whole request. The server aggregates one page at a time without a
history cache, action reconstruction, or coupling to bot statistics or Actions.

`personal-results.ts` validates immutable initial human ownership and actual engine
participation. Missing ownership is explicitly unknown. Existing adapter restore,
snapshot, decision and owner-result views validate initial/final hand identity,
completed settlement, participant continuity,
pre-blind baselines against initial commitments, blind consistency and conserved
stacks in the results service. Missing/inconsistent results are excluded from
totals; known completed participation still counts in `handsPlayed`.
`availableHands` counts validated results; totals are
null when all candidate results are unavailable. Final/current seat ownership,
names and host status never establish attribution. BB totals use compensated
summation of each original-blind fraction; highlights use chip net with earliest
ties. Rounding occurs only in presentation.

The shared overlay keeps a results component mounted, with its modal closed, while
its replay is open. Closing that replay (Close, Escape or backdrop) returns to
results and preserves the snapshot and highlight focus. No extra back button is
shown for results; Back to Actions is unchanged. A new
completion offers explicit refresh, with no automatic reload. Requests are aborted
and late responses fenced on unmount/navigation. Live session work and warnings
continue independently.

## Completed-hand replay

`get_hand_replay(uuid, integer)` is a stable service-role-only SQL read. One statement
selects hand status, initial/final snapshots, ordered actions with pre-action states
and actor seats, and reveals filtered by game, hand ID and hand number. No current
seat ownership or provider context participates. Missing/deleted hands return null.

`lib/poker/hand-replay.ts` reconstructs through the engine adapter. It recreates
the after-blinds state first, rejecting truncated preflop history disguised as an
initial snapshot. It rejects
missing legacy snapshots, noncontiguous sequences, mismatched actor/street,
illegal actions, differing pre-action engine states or a differing final engine
state. Immutable initial participants determine names, identity and cookie ownership.
Engine events provide action and street frames, including automatic runouts before
settlement. Per-pot awards come from the validated completed engine state. Other
players' cards appear only in Result through the existing public projection rules;
only the viewer's own cards appear earlier. Private snapshots never leave the service.

The strict browser-safe `replay-contracts.ts` allowlist is shared by the route and
`api.games.replay`. Successes and errors use `private, no-store`. Expected missing,
unfinished and invalid history outcomes have distinct `REPLAY_*` codes; database
failures use sanitized `replay` application-failure logging and remain retryable.
The route performs no writes, provider calls, inference-context changes or broadcasts.

`HandReplayModal` has no game-session hook or betting controls. The single overlay
owns its lifecycle; close/navigation abort its request and request generations fence
late responses. Only one requested hand is retained until close. Live state continues
outside replay, preserving its frame index and delivering a turn/countdown notice.
Mobile Actions saves its scroll position for Back to Actions; overlay replacement
never stacks dialogs or lets old focus restoration steal the new dialog's focus.

### Hand-specific shared snapshots

`reconstructHandReplay` validates the complete persisted history once, independently
of visibility. `projectHandReplay` preserves the in-game owner/final-frame behavior;
`projectSharedReplay` admits only one immutable participating human owner and freezes
owner, bot and publicly permitted final holdings into every frame. Neither current
assignments nor recipient cookies affect visibility. Strict version-1 snapshot
schemas omit source game/hand identifiers, player IDs, credentials and engine/provider
state. The server reconstructs and validates before management; the storing RPC
locks the game/hand, rechecks historical ownership and compares the full input read
against a fresh `get_hand_replay` before storing. Changed history fails with a conflict.

Service-role-only `replay_shares` stores 256-bit random hexadecimal tokens, source
references with deletion cascades, creator ownership, immutable snapshots, creation,
expiry and revocation timestamps. The database serializes management per game and
returns an existing active share before admission, preserving its expiry. Expired
rows are retired before inserting a new random token; old tokens never reactivate.
Every viewing read uses `clock_timestamp()`, with identical unavailable responses
for unknown, expired and revoked tokens. There is no cleanup scheduler.
Share admission reuses locked `reserve_usage` with distinct `share:owner` and
`share:ip` counters (20 and 100 per hour); game/inference counters are untouched.

Management endpoints use ownership cookies and require same-origin mutations.
All JSON responses are private/no-store. Uncertain mutations reconcile through the
management GET without automatic replay; a failed read blocks further mutations
until explicit status refresh. `ReplayViewer` accepts only sanitized presentation
props and owns optional playback of loaded frames using one cancellable timer.
Playback starts paused, stops at Result, and resets paused on hand replacement.
Manual navigation, hidden tabs, inactive viewers and overlaid dialogs cancel the
pending callback. A generation guard rejects stale callbacks after cancellation.
Preference rerenders do not affect the timer dependencies or move keyboard focus;
automatic steps reuse the existing frame announcement. `HandReplayModal` owns
focus, live-turn warnings, owner loading and return
navigation. Sharing opens a child native dialog above the visible replay, keeps
the viewer at its selected frame, pauses playback, suspends its arrow handler and
restores focus to the header trigger on return. Modal scroll locks are reference counted; closing the child
keeps the parent locked. Child cancellation/pointer events do not bubble into
parent dismissal, and focus restoration targets only the top remaining dialog.
Standalone localized `/replay/:token` pages have no live session hook,
polling, Realtime, claims or bots. They fetch only the fixed snapshot, start at
frame zero. Standalone arrows also accept neutral page focus before the first
interaction, without stealing focus on load. Editable controls, other focused
controls, modifier keys and open dialogs retain their keys. Metadata is generic noindex/nofollow,
URLs are excluded from Speed Insights (the component is not mounted on shares),
and responses set no-referrer. Shared pages have no source-table links.


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

Internal benchmark injection threads a server-owned `BettingMenu` (`current`,
`quarter-pot`, `1.5-pot`) through context preparation, both confidence wrappers,
SystemOne request/move construction and validation, and LLM schema/parsing.
Constructors default to `current`; the production registry never selects an
experimental menu. No client/API/environment/public DTO selection exists. New
identifiers are internal only; public sizing validation rejects them before a
production action commits. Equity Rules uses its unchanged legacy sizing path.
The independent [bet-sizing experiment](../benchmarks/bet-sizing/README.md) keeps
paid authorization, source freezes, fixtures, allocation and analysis outside
production. Scripted compatibility does not establish playing strength or authorize
promotion; a separate paired-match study is required.

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
`status` (400–599). The reference is generated at logging time and returned by the logger. Unexpected
application-owned JSON failure responses include that same optional UUID; HTML
forms/redirects and framework rendering errors do not expose it.
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
reference is returned only on the corresponding unexpected JSON failure and is not propagated into service,
provider or publication logs; it cannot correlate an entire request lifecycle.
Browser diagnostics in `lib/http/diagnostics.ts` contain only a fixed named
transport operation, a client-observed UTC timestamp captured once, failure kind
(`http`, `network`, `deadline`, `invalidResponse`), optional HTTP status and
validated server UUID, and the build identifier. `next.config.ts` exposes only a
validated full `VERCEL_GIT_COMMIT_SHA`, otherwise `local/unknown`; it exposes no
arbitrary environment value or deployment URL. Malformed reference metadata is
discarded independently of error classification. Older envelopes still work.

Diagnostics stay with their particular visible failure, behind the existing
session/request guards. Reports retain at most the original operation and a
labelled failed reconciliation, clearing after resolution, dismissal or
replacement. Expected outcomes and cancellation have no diagnostic action.
Silent reads and specialized provider logging remain unchanged; a provider
failure may have no application reference. Network, timeout and invalid-response
reports explicitly say `Server reference unavailable` and never claim log
correlation. The shared copy control formats only validated diagnostic fields,
never messages, stacks, request bodies, cards, names, cookies, tokens, game/share
URLs or identifiers, or browser fingerprints. Clipboard failure reveals selectable
plain text; success is announced with `role="status"`. Copying is explicit and
local, with no telemetry or automatic submission/prefill of the feedback form.
Deadlines, recovery and mutation replay policy are unchanged.

This covers application-authored diagnostics only. Automatic framework and
hosting logs are outside this boundary. There is no external monitoring service,
database migration, feedback integration or response-contract change.

## Play and personal table discovery

`/[lang]/play` selects one URL-backed collection: personal by default, public for
`?tab=public`, shared for `?tab=shared`; invalid/repeated values fall back to personal.
The English wrapper forwards the search-parameter promise. Localized normal links
in a labelled navigation region use `aria-current` and `prefetch={false}`. Only the
selected collection renders inside a locale/tab-keyed Suspense boundary. Play reuses
the table loading spinner without visible text, using the directory’s existing generic
loading label for screen readers instead of collection-specific translations; cookies
are read there. Unmount cancellation fences personal, directory and share responses.
The header keeps creation/name controls and a separate Settings button. Settings uses
the game dictionary loaded server-side through I18nProvider, the shared preference
store/modal and low-level audio preview, without any game/session/timer/bot hooks.
Its navigation destination preserves the selected tab; Play omits the in-game note.
The cached landing page links to Play and retains its anonymous Quick Play POST form with client-only progressive enhancement.
Localized `/join-game` permanently redirects to `/play` in the same language;
English uses unprefixed URLs through `app/(english)` wrappers that reuse
the shared locale pages, layouts and POST handlers with `en-US` params. Old `/en-US` URLs permanently redirect to unprefixed equivalents.
Other locales retain their prefixes; browser language never redirects pages.
Play is `noindex, follow`
and excluded from the sitemap. No polling or Realtime runs on Play.

Owner share management uses service-role-only `list_replay_shares_with_title` and
`revoke_owned_replay_share`. The list filters creator cookie, revoked state and
exclusive database-time expiry before returning 20 rows ordered by
`created_at DESC, link_token DESC`, with one lookahead. Cursor timestamps preserve
Postgres microseconds as strings. The partial owner/ordering index supports the scan.
Strict HTTP contracts expose token, hand number, creation/expiry timestamps and nullable title with title revision;
no snapshots, source game IDs or ownership tokens enter list DTOs. GET
`/api/replays/owned` and DELETE `/api/replays/owned/[token]` are private/no-store,
no-referrer, cookie-owned; mutations enforce same origin. Failures log only existing
allowlisted `replay_share` diagnostics. Exact revocation locates the owner token,
then locks game, hand and exact share in the same order as creation/deletion. Missing,
foreign, expired or retired targets are harmless. It cannot touch a replacement link.
Share allowances, snapshots, 30-day expiry and deletion cascades are unchanged.

Shared title metadata lives outside the immutable schema-version-1 snapshot.
`manage_replay_share_with_title` returns an internal insertion-only `generationEligible`
flag; the creation transaction consumes the one attempt, including when inference
is disabled or interrupted. Duplicate requests never receive eligibility. The
service constructs a bounded field allowlist from that request's frozen snapshot:
seats, visible cards, boards, betting and awards, without participant names or source
identifiers. Oversized summaries are declined. `SHARED_HAND_TITLE_MODEL` selects
the separate server-only model, using LLM endpoint/key and the external inference
gate. A title-only transport enforces eight seconds across headers/body (the gameplay
transport remains a frozen benchmark dependency),
with a 256-token output cap, structured `{ title }`, no retries or fallback.
Malformed, multiline, empty and overlong output is discarded silently. No gameplay
prompts, bot claims, context preparation or allowances are involved.
`commit_replay_share_title` conditionally writes only an active exact link at
revision zero. Manual edits (including clearing) increment the revision and defeat
in-flight generation. PATCH `/api/replays/owned/[token]` validates expected title
revision and the anonymous cookie owner, rejects retired/expired targets and returns
409 on conflict. Owner DTOs include title/revision; public replay DTOs add nullable
title outside the snapshot. Title-aware list/read/management RPCs use `_with_title`
names; the original functions retain their exact legacy response shapes for
rolling deployment. Read/list endpoints never generate. React renders text
without HTML interpretation. Editor overlays preserve the mounted replay and its
position, and require refreshed editing after a revision conflict.

Client requests have 15-second deadlines and cancellation on unmount. A synchronous
lock prevents duplicates. Unknown outcomes reconcile once by reading the list, never
replaying DELETE; failed recovery blocks management until a successful explicit
refresh. Post-acknowledgement refill errors affect only the list. A one-shot expiry
wake-up plus interaction checks removes local stale rows without polling. Viewer
links set noreferrer/no-referrer and tokens never enter telemetry.

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

## Amount presentation

The version-1 browser settings codec includes `amountDisplay: "chips" | "bigBlinds"`,
with a missing-field default of `chips`. `useSettings` retains post-hydration reads,
full-entry persistence, cross-tab synchronization and in-memory updates on storage
failure. Play and the table reuse SettingsModal. AmountDisplayProvider passes the
viewer’s preference to table descendants and the shared ReplayViewer; standalone
shares load the same local preference. It never participates in betting state,
turn identity, engine decisions, payout calculations or request contracts.

`components/poker/amounts.ts` centralizes localized presentation. BB conversion
uses integer arithmetic to detect inexact hundredths, marks rounding with ≈,
omits trailing zeros, and represents nonzero magnitudes below 0.01 BB with <,
preserving signs. Accessible output expands BB and approximation into localized
words. `formatChips` remains available for configuration, summaries and diagnostics.
Bet drafts, slider bounds, increments, percentage presets and submissions remain
integer chips; BB mode labels entry units and displays total-target equivalence
separately from additional payment. Display changes preserve component identity,
focus and replay position; announcement identity excludes this preference.

Optional positive integer `bigBlind` on replay data and feed `handStarted` comes
only from that hand’s immutable initial configuration. Legacy feed failures retain
persisted actions without inventing a blind value. Each Actions group uses its own
hand-start metadata, including incremental updates within the existing 50-hand
bound. New sanitized shared snapshots explicitly allowlist `bigBlind`, retaining
schemaVersion 1 and accepting older frozen snapshots without it. No stored shares
are updated, no source game is fetched for fallback, and card visibility and source
identifier exclusions stay intact. Absent historical metadata in BB mode produces
labelled chips and a brief replay notice. No migration or endpoint is needed.

## Help content

Each supported locale has a complete Markdown-authored document in `content/help/`
with an exported localized `title`. The explicit locale map in `lib/help/server.ts`
is server-only and reuses the installed MDX configuration. The shared game Server
Component loads only the selected locale and passes rendered content and its title
into `PokerApp` through a React-node slot; unprefixed English routes use the same
component with `en-US`. Landing and Play also load the selected guide server-side into the isolated
`PublicPageTools` header subtree. `PublicPageControls` reuses Settings and the
shared `HelpModal`, with browser-local preferences, one active dialog and focus
restoration. The landing page remains cached; the controls alone use a local
I18nProvider/Suspense boundary for URL navigation. They read no cookies and start
no game-session, bot, timer or polling hooks. About remains server-only and uses
its header brand link for home navigation. Client modules never import help
documents or fetch them at runtime. Help uses the game dictionary’s Help label and the same localized Close label as Settings.
Localized Help imports the server-only `InlineCardExample` for text-sized ranked
hands, the royal flush and suit legend. Suit-marked spans share
`SuitColour.module.css` with visible `PlayingCard` faces and inherit suit variables
from the `PokerApp` wrapper, which contains the table and every overlay. The
version-1 browser settings codec defaults a missing `cardColours` to `classic`;
post-hydration loading switches the wrapper palette without game or HTTP changes.
No document-wide style mutation or client Help provider is needed. Four-colour
blue (`#1856a0`) and green (`#21633e`) maintain at least 4.5:1 text contrast on
card (`#fffdf6`) and Help (`#f8f7f0`) backgrounds.
`game-overlay.ts` defines the discriminated `GameOverlay` union and pure navigation
transitions; `useGameOverlay` owns the active navigation instance, game-scoped opener
reference and Actions scroll position. `PokerApp` calls named open, close, replay and
Back operations and passes the current overlay to `usePlayerControls` for gameplay
shortcut blocking.
Dialog rendering and feature work stay in existing components: no mutations, replay
requests, departure recovery, betting state or bot loops belong in the controller.
Each close/Back callback captures its navigation instance; the transition rejects
callbacks after replacement, reopening or game changes, including late Join success.
Game changes reset navigation and stored return context. Eligibility reconciliation
closes Join after seating and bot information when its bot disappears, the table is
unavailable or waiting. Leave remains open through eligibility and recovery changes,
with pending dismissal guarded by `ConfirmationDialog`.

| Current overlay / event | Result |
| --- | --- |
| Any / open dialog | Replace with requested kind; capture new opener |
| Actions / open replay | Replay with Actions origin; retain external opener and scroll |
| Table, result, desktop Actions / open replay | Replay with table origin; capture opener |
| Replay with Actions origin / Back | Actions at saved scroll position |
| Any current instance / Close | Live table; no implicit Actions return |
| Join no longer spectator / refresh | Close |
| Bot information missing, unavailable or waiting / refresh | Close |
| Leave / eligibility change | Keep explanatory or recovery state |
| Fold confirmation / changed decision, expiry, lost ownership or blocked mutation | Close without acting |
| Any / game ID change | None; discard return context |
| Any / stale Close or Back | No change |

`usePlayerControls` owns the betting draft, validated target, shared click/keyboard
action-intent handler, keyboard listener and fold-confirmation reconciliation interval.
It receives explicit authoritative game/identity, blocking, preference and overlay
inputs plus existing callbacks, rather than a session object. Draft scope remains
game ID, version and viewer ID; render-time reconciliation prevents stale values
from appearing before effects when that scope changes. Authoritative actor changes
advance the version. The hook returns the draft, validated target, sized legal
action, setter, intent handler and the human-turn flag needed by rendering.
It performs no HTTP requests itself: `useGameSession` retains HTTP,
concurrency, bot lifecycle integration and unknown-outcome recovery. Overlay
navigation stays in `useGameOverlay`, and `PokerApp` retains modal rendering and
confirmed-action validation/submission. Existing guard differences are recorded in
[the extraction characterization notes](../plans/player-controls-characterization.md).

Voluntary table and keyboard actions pass through the shared hook action-intent
handler. When authoritative Fold and Check actions are both legal, it opens the
typed `foldConfirmation` overlay with game ID, hand, version and actor ID.
`fold-confirmation.ts` validates that decision against current ownership, live
seat assignment, turn eligibility, legal actions, deadline and mutation blocking.
The hook reconciles authoritative changes immediately and checks elapsed deadlines
while open; same-decision refreshes remain valid. The dedicated small
`FoldConfirmationDialog` focuses Check and shares one synchronous lock across
Check and Fold anyway. Each choice revalidates, resolves the current legal action,
closes, and calls the existing session mutation flow directly. Cancellation never
submits. Session pending, conflict and unknown-outcome recovery semantics remain
unchanged, as do timeout/departure folds and the destructive `ConfirmationDialog`.
The existing modal turn warning/countdown remains visible; nothing pauses the game.

All dialogs retain the shared native `Modal` lifecycle. Only `Modal` handles focus
trapping, initial focus, scroll locking and restoration, including replacement and
navigation safeguards. Bot information stores an immutable participant ID and resolves
only the latest `poker.players` public metadata. It closes when that participant
is removed or ceases to be a bot. Native seat-name buttons restore focus on close;
Help is the fallback if the opener disappears. Opening performs no requests or
catalog lookup, and does not affect timers, bot advancement or session recovery.
Concise provider and supported configuration descriptions live in server-owned
game dictionaries and agree with About MDX; no inference details are exposed.

`shareTable` renders one `ShareTableModal` from the shell for both header and
waiting-room entry points. It uses `inviteUrlFromLocation` and `useShareClipboard`
without API calls or mutations. Only the localized origin/path is copied; no
credentials, query, fragment or ownership token is included. The selectable URL
is always visible. The reusable `FeedbackButton` reserves both label sizes and
shows Copied for two seconds on success, with no separate success paragraph.
Copy link receives initial focus, the actual opener receives
restored focus, and unmount/game identity clears feedback and fences late copies.
Waiting tables with an open human seat invite seating; other states offer watching.
The shared overlay shortcut guard applies, while the session, bots and timers keep
running and the dialog shows the existing owned-turn warning/countdown.

`ModalTurnProvider` receives the shell’s existing owned-turn eligibility and live
game. `ModalTurnWarning` uses it in Share table, Stats, replay, replay sharing,
Settings, Help, bot information, mobile Actions and Leave table. Every instance
uses the same Stats-style badge and `TurnCountdown`. Outside a live table (such
as Play settings) or on an ineligible turn it renders nothing. It owns no session
requests, gameplay eligibility, actions or timers beyond the existing countdown.

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


## Hand accessibility announcements

`useHandAnnouncements` owns a single polite, atomic region for turn and completion
messages independently of audio/title notifications. `useGameSession` increments an
internal accepted-response revision even when reconciliation retains the same game
object. This is client observation metadata, not a game version or API field.
Visibility and online transitions establish a freshness barrier: only a later
accepted authoritative response can produce a message. Hidden, offline, pending,
recovery-blocked, unavailable and expired decisions cannot produce turn messages.
The hook clears its timer/listeners/region on route teardown and never moves focus.

`hand-announcements.ts` identifies decisions from game/hand/street/actor, the
server decision ID when present, legal actions, pot and authoritative player
bets/stacks/fold/all-in state. Versions, overlays, slider drafts, countdown seconds
and feed changes do not identify a decision. A consumed identity is not repeated
when an overlay changes or recovery succeeds. Completion uses game/hand identity
and public authoritative awards plus viewer net change, never feed data or holdings.
Detailed results remain ordinary readable content outside broad live regions.

The hook moves an empty region into the last open native dialog (including nested
sharing), or back to the page, without replaying its consumed message. A new turn
never closes replay. Replay has its own concise step region: action counter,
actor/action, changed street and newly visible board cards. Inactive replay beneath
a sharing dialog disables that region. Countdown seconds and adjustable bet output
are not live announcements; the existing urgent countdown warning and errors remain.

`CardImage` supplies shared image semantics to `PlayingCard` and server-rendered
Help examples. Decorative children are hidden; placeholders stay hidden. Hidden
cards take the hidden-name branch before reading a supplied card. All accessible
card text uses the same filtered public cards as visual rendering. Help receives
its localized card dictionary from its server-only MDX module. Occupied seats are
named groups with readable stack/current-bet/role text; interactive bot controls
remain separate controls. Descriptive replay content is not a Tab stop.

### Presentation and appearance

Play collections use internal presentation components in `app/[lang]/play/Collection.tsx`: a server-rendered shell outside the selected data boundary, decorative three-row skeletons, and a shared refresh control positioned at the heading. Request ownership remains in each existing client collection; list notices stay inside the reserved list region. These interfaces do not change HTTP or persistence contracts. Play resolves its URL-selected shell before the first flush (`instant = false` on both locale and English route pages), then streams only the data-dependent content. This avoids hiding headings behind an outer streamed replacement on WebKit; only URL selection and server-owned translations block that first shell, never collection reads.

See the [design system](design-system.md) for visual conventions, component reuse
and review references. This section describes the underlying implementation.

Semantic CSS tokens in `app/globals.css` define ivory/ink surfaces, accessible
foregrounds, actions, status, felt and cards. CSS Modules remain the component
styling boundary; there is no theme dependency. `lib/theme/preference.ts` owns the
`ThemePreference` union and the head initialization script. Both locale root
layouts (through the English wrapper) and the standalone global 404 apply it
before paint. CSS media fallback follows device appearance without JavaScript.
Cached pages never read appearance cookies.

`lib/theme/controller.ts` exposes a shared browser store through
`useSyncExternalStore`. It validates `ai-holdem-theme`, tolerates denied storage,
synchronizes tabs and applies device changes only in System mode. Theme updates
change root CSS tokens without remounting the game. Server-owned appearance labels
are passed into the public control; Settings uses the game dictionary.
`components/poker/seat-position.ts` sorts physical seats and rotates by stable
player identity for a presentation-only clockwise layout, shared by live tables,
lobby previews and replay. It does not change engine order, ownership or actions.
