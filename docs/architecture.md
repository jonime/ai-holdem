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
the resulting engine state, action record, and (for AI turns) the decision
audit while enforcing the expected game version.

## Bot advancement and Realtime

Only the host or a browser that owns a seated human player advances bot turns.
Folded and eliminated seated humans remain eligible; an unseated host can drive
a bot-only table. Other spectators are passive: Realtime and polling refresh the
table without requesting bot actions or offering bot retry. The server rejects
unauthorized `/step` requests with HTTP 403 before resolving a provider or
requesting inference. Bots pause when no eligible browser remains open.

Each browser runs at most one advancement loop, stopping at a human turn or hand
completion. Starting another hand still requires explicit interaction. Multiple
authorized browsers can race and request duplicate inference, but expected-version
checks allow only one action to commit. A losing bot-step loop stops and refetches
silently; refresh failures and genuine provider errors remain visible, and eligible
viewers can retry. There is no worker, leader election, cross-browser lock, or
inference deduplication.

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
SQL migration is required for Broadcast. The demo intentionally uses public
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
when the host comes back. The directory refreshes every 15 seconds, supports
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
Facts, advice and policy have independent versions; the supplied context and
advice identifiers are kept in existing private audit storage. Candidate
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

In Vercel runtime logs, search for `llm_provider_http_failure` or
`typesafe_provider_http_failure` to find structured LLM or Jev HTTP failures:
game ID, fixed reason, HTTP status, numeric provider error code (100–599),
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
