# TypeSafe AI Texas Hold'em

A no-limit Texas Hold'em demo where TypeSafe System One proposes a
constrained action and the poker engine remains authoritative for every rule.

Repository: [github.com/jonime/ai-holdem](https://github.com/jonime/ai-holdem)

Public app: [ai-holdem.vercel.app](https://ai-holdem.vercel.app)

## What It Does

- Persists games, hands, actions, and AI decision audits in Supabase.
- Validates each human action against the authoritative engine.
- Lets TypeSafe and the deterministic offline Equity Rules bot act only
	through server-side validated choices.
- Shows legal actions, probability distributions, confidence, and a hand feed
	grouped by betting street with community cards revealed at each stage.
- Keeps AI hole cards, TypeSafe input, raw responses, and private bot state
	confidential until the relevant hand completes.

## Starting a game

The localized homepage introduces all three ways to use the demo: play against
AI bots, invite friends, or watch bots play. **Quick Play vs AI** creates a
private, unlisted six-seat table with 50/100 blinds and 10,000-chip stacks,
seats the visitor with five bots selected from the available Equity Rules,
TypeSafe Jev, and configured LLM catalog, and starts hand 1 immediately. Rules
and Jev seats use medium difficulty; LLM seats receive a random server-owned
playstyle. When external inference is disabled, Quick Play uses only Equity
Rules so it remains playable offline and without provider credentials. **Create
custom table** opens the existing private, six-seat waiting lobby, where the
host can customize a 2–6-seat table, players, bots, stakes, and publication
before starting. **Join public table** opens the public-lobby directory; invite
links continue to work for private tables.

While a game is waiting, the lobby shows one contextual next step based on the
authoritative seat state, host permissions, and the host's current settings.
Hosts can start with any two occupied seats, including bots, and may stand up
before starting to watch as a spectator. Guests can take any open seat or wait
for the host as a spectator. Every waiting lobby also offers a localized copy
button for the clean game URL (origin plus localized path only); anyone with
that URL can view the table and take an open seat. If browser clipboard access
is unavailable, the lobby exposes the same URL in a selectable field for manual
copying.

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

This repo treats documentation as part of the implementation. If setup steps,
commands, env vars, or workflows change, update the docs in the same change.
This is a security-sensitive project: do not weaken validation, secret handling,
privacy boundaries, or version-checked mutation rules in the name of speed.

## Search and social previews

Public landing and About pages have localized titles, descriptions, canonical URLs,
and language alternates. `/robots.txt` points to `/sitemap.xml`, which lists the
localized landing and About pages and the canonical English developer page.
Individual game pages and the changing public-table directory use `noindex, follow`.
This is search-indexing guidance, not access control; table URLs remain shareable.

Set `NEXT_PUBLIC_APP_URL` to your public HTTP(S) origin when using a custom domain.
Without it, metadata uses `VERCEL_PROJECT_PRODUCTION_URL`, then
`https://ai-holdem.vercel.app`. These values are resolved at build time for static
pages, so rebuild after changing the domain. Submit `/sitemap.xml` in Google Search
Console after deploying.

Open Graph and Twitter cards use the supplied 1731 × 909 `public/social-preview.png`.
The image is committed and needs no runtime service. When replacing it, update
its dimensions and alt text in `lib/seo.ts` to match the new asset.

## Local Setup

Use Node.js 24 or newer and install dependencies from the lockfile.

```sh
npm ci
cp .env.example .env
```

Set these values in `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
TYPESAFE_API_KEY=
LLM_API_ENDPOINT=
LLM_API_KEY=
LLM_BOT_MODELS=[]
EXTERNAL_INFERENCE_ENABLED=true
```

`SUPABASE_SECRET_KEY`, `TYPESAFE_API_KEY`, and `LLM_API_KEY` are
server-only. Do not prefix them with `NEXT_PUBLIC_` and do not commit `.env`.
`EXTERNAL_INFERENCE_ENABLED` can be set to `false` in low-cost or offline
settings, while `LLM_BOT_MODELS` is a JSON array of LLM model definitions used
through the OpenAI-compatible chat-completions endpoint configured in
`LLM_API_ENDPOINT`. Each definition accepts `id`, `label`, `modelId`, and an
optional `reasoning` effort: `none`, `minimal`, `low`, `medium`, `high`, or
`xhigh`. Reasoning defaults to `minimal` when omitted.

```env
LLM_BOT_MODELS='[{"id":"my-llm","label":"My LLM","modelId":"provider/model","reasoning":"low"}]'
```

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
reloaded. See [Realtime architecture and verification](plans/05-realtime-broadcast.md)
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

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor workflow and
checklist. Keep this README, [AGENTS.md](AGENTS.md), and [CONTRIBUTING.md](CONTRIBUTING.md)
kept in sync with the repo. If a workflow, command, setup step, or env variable
changes, update the docs in the same change.

Run every SQL file in [supabase/migrations](supabase/migrations) in filename
order using the Supabase SQL Editor, or let the GitHub integration below push
them for you. The migrations create RLS-protected tables and server-only RPCs
used for atomic version-checked game updates.

`20261008000000_add_public_game_directory.sql` adds the private-by-default
listing table, host leases, directory RPCs, and atomic seat mutation RPCs. Apply
it, `20261008000100_classify_unavailable_directory_joins.sql`, and
`20261008000200_add_public_game_exclusions.sql` before deploying the matching
application code. The last of those directory migrations adds the server-only, lightweight viewer
exclusion query used with the shared directory cache. They need no backfill or
cleanup scheduler.

## Automatic Production Migrations

Migrations deploy via Supabase's native GitHub integration rather than a
custom CI workflow. One-time setup in the Supabase dashboard:

1. `supabase/config.toml` must exist and be committed (created once via
   `supabase init`; it holds local config only, not your project ref).
2. Project Settings -> Integrations -> GitHub -> Authorize GitHub -> connect
   this repository, and set the working directory to `.`.
3. Set `main` as the production branch and enable the **Deploy to
   production** option so pushes/merges to `main` apply new migrations.

After that, any push to `main` that adds files under `supabase/migrations/`
is applied to production automatically — no GitHub secrets or `supabase
link` required (that command only caches credentials locally in the
gitignored `supabase/.temp/`).

Preview/per-branch databases (Supabase Branching) were intentionally skipped
for this demo since it's a paid, per-branch-hour add-on; previews reuse the
same `.env` values configured in Vercel.

## Development

```sh
npm run dev
```

The development server defaults to http://localhost:3001.

Use the built-in offline bot catalog for deterministic play without external
inference: `Equity Rules` is the default non-LLM rules option, while
`TypeSafe Jev` and configurable LLM bots remain available as
provider-specific choices. `LLM_BOT_MODELS` configures each LLM model and its
reasoning effort; the lobby's server-owned Balanced, Tight, and
Aggressive playstyles are selected independently and never accept custom prompt
text.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## Translations

Every route is served under `/{locale}/` for ten supported locales. Dictionaries
live in `lib/i18n/dictionaries/` as `server-only` modules split by route group
(`metadata`, `landing-server`, `join-game`, `game`). Server Components load them directly
through `lib/i18n/server`; client game components receive the game route's
`I18nProvider`. The landing and About pages use a server-only language menu with a native
`<dialog popover="auto">`: outside clicks and Escape dismiss it, and ordinary
locale links navigate to a new document so the menu closes on selection. CSS
anchor positioning places it below the trigger, with a centered fallback;
browsers without popover support show the language links inline.
The landing page uses plain
HTML forms for one-click quick play and custom-table creation without JavaScript. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to add keys or locales.

The localized About page is Markdown-authored under `content/about/`. Its MDX
documents compile directly into Server Components and export their own localized
title and description. The route has no client component boundary or runtime
content fetch.

## Agent and Search Discovery

The public homepage serves substantial server-rendered HTML to browsers and a
clean Markdown representation when the request prefers `text/markdown`. The
negotiated responses use `Vary: Accept`; unsupported homepage media types
receive `406 Not Acceptable`. Unknown pages keep a real `404` status and return
a Markdown error with a discovery link when Markdown is requested.

Public discovery resources are available at predictable URLs:

- `/llms.txt` — the spec-formatted agent map for the product and documentation.
- `/sitemap.xml` — localized homepage and developer-resource URLs.
- `/robots.txt` — crawler permission and sitemap location.
- `/{locale}/about` — localized bot, difficulty, poker-engine, and privacy guide.
- `/{locale}/developers` — architecture, integration status, and source links.

Verify content negotiation and machine-readable files against a running app:

```sh
curl -sS -L -i -H 'Accept: text/markdown' http://localhost:3001/
curl -sS -L -i -H 'Accept: text/html' http://localhost:3001/
curl -sS -i -H 'Accept: text/markdown' http://localhost:3001/missing
curl -sS http://localhost:3001/llms.txt
curl -sS http://localhost:3001/sitemap.xml
curl -sS http://localhost:3001/robots.txt
```

### TypeSafe policy evaluation

Run the deterministic, cost-free policy benchmark with seeded deals and each
seat assignment:

```sh
npm run benchmark:policy
```

It compares the frozen v1 policy surrogate and the v2 exact-move policy
surrogate against `equity-rules-v2` plus scripted passive and aggressive
opponents. The JSON report includes big blinds won per 100 hands, a 95%
uncertainty interval, action frequencies, failures, and decision latency. This
is a regression harness for policy mechanics, not evidence that Jev plays
stronger poker.

The current Jev wrapper policy is `typesafe-poker-v2.1`. Easy mode samples the
provider distribution without adding uniform randomness; medium and hard use
the provider's selected move. Before asking Jev, exact heads-up river evaluation
removes folds when calling guarantees nonnegative chip EV, calls that lose to
every possible holding, and bets/raises on a forced board split when checking or
calling is safe. These are candidate restrictions; the engine remains the final
legality authority. Ordinary uncertain positions still use Jev's decisions.

LLM bots use policy `llm-poker-v2.1-{playstyle}` and share these candidate
safeguards with Jev. The request schema and local response validation enforce
the same restricted action set for every playstyle. LLM context also corrects
call cost, pot odds, the contestable pot before calling, stack-to-pot ratio, and
bet/raise sizing for current street commitments and stack-capped calls. Provider
errors or excluded decisions are rejected rather than silently replaced.

Live Jev evaluation is deliberately separate from CI because it makes one paid
TypeSafe request per decision:

```sh
EXTERNAL_INFERENCE_ENABLED=true TYPESAFE_API_KEY=... npm run benchmark:typesafe:live
```

The live command uses seeded, seat-swapped deals and emits the same metrics.
Only statistically supported live comparisons should be used to claim stronger
play; passing unit tests or the mocked benchmark is insufficient.

### Local Supabase E2E

Start the local Supabase stack with `supabase start`, then run:

```sh
npm run test:e2e
```

The Playwright setup reads credentials from `supabase status`, starts Next on
an isolated port, and runs the browser flow against that local database. It
never uses the remote values from `.env`.

Use a clean local database when validating migration-dependent behavior:

```sh
npm run test:e2e:reset
```

## Deploy To Vercel

1. Import the existing Git repository in Vercel.
2. Keep the default Next.js build settings (`npm run build`).
3. Add the environment variables listed above for Production and Preview.
4. Deploy.

The application uses the Supabase Data API from Next.js server routes, so keep
the Supabase Data API enabled. The browser never receives the Supabase secret
or TypeSafe API key.

## Architecture

Every application-owned JSON endpoint shares browser-safe, feature-specific
Zod contracts in `lib/http/*-contracts.ts` and named, runtime-validated client
calls in `lib/http/api.ts`. Public DTO types are inferred from those schemas;
ownership-aware server projections still control private data. The transport
preserves cancellation and cookies, keeps authoritative reads uncached, and
never retries mutations. HTML forms/redirects, Realtime messages and external
provider clients retain their separate boundaries. See the
[endpoint contract checklist](CONTRIBUTING.md#http-contracts) for every route,
client method and verification requirements.

```text
browser -> Next.js API routes -> poker engine + TypeSafe -> Supabase
```

Each request applies at most one player action. Supabase RPCs atomically store
the resulting engine state, action record, and (for AI turns) the decision
audit while enforcing the expected game version.

## Bot decision scenarios

Run `npm run test:bots` for reproducible engine-backed legality and obvious-blunder
checks against Equity Rules. Each bot/model has a separate test group. LLMs
include every supported playstyle (`balanced`, `tight`, `aggressive`) as nested
groups. Filter a profile with `-t 'my-llm.*tight'`, or select an entire bot with
`npm run test:bots -- -t 'equity-rules-v2'`. The same fixtures
support opt-in live TypeSafe and configured LLM bots. See [scenario instructions](benchmarks/scenarios/README.md)
for commands, costs, extending fixtures, and strategy limitations. Equity Rules
passes eight river scenarios at all three difficulties. The evaluation returns
nonzero for illegal actions or listed blunders; fixture/grader tests run in ordinary
`npm run check` without external services.

Vitest automatically loads the optional root `.env.test` file for unit tests and
benchmarks before collecting tests. Existing shell/CI variables take precedence;
`.env` is not loaded. `.env.test` is ignored by Git and can hold local provider
credentials. Live bot evaluations still require their explicit opt-in flags.

### Betting controls

Each new decision (game ID, authoritative version, or viewer change) starts at
its engine-provided minimum bet or raise. Same-version polling preserves edits.
The numeric input and slider select a total street target. The compact “+amount”
below the numeric input shows additional chips paid, subtracting chips already
committed on this street. Empty, fractional, unsafe, and out-of-range
input disables only bet/raise submission. Buttons and keyboard shortcuts use the
same validated amount; action shortcuts are ignored while typing. Q/E and left/right
arrows adjust sizing by one big blind. Hold Shift with either shortcut to adjust
by five big blinds. Adjustments stay within the engine’s legal range, including
when the slider has keyboard focus.

50%, 75%, and Pot presets select amounts without submitting. For displayed pot P,
street commitment C, legal call cost K, and fraction f, bets target round(f × P),
and raises target C + K + round(f × (P + K)). The displayed pot includes side pots and unmatched chips already paid into the active hand.
Presets are clamped to the engine’s legal range; All-in selects its maximum.
The server and engine still validate every action and expected game version.

### End of table and fresh Quick Play

An owned seat is out of chips only once its zero stack is settled at hand completion
or it is no longer in the hand. An unresolved all-in can still win chips. Eliminated
players can start **New Quick Play**, or manually **Watch next hand** when eligible.
Ongoing hands show “You’re watching” and retain a disabled **Watch next hand**
button for eliminated players. A table with one remaining funded player
announces the winner and offers New Quick Play without Next Hand. Buttons, S,
Enter, Space, and the next-hand handler share eligibility; seated humans and hosts
of bot-only tables retain their existing controls and expected-version checks.
The final hand result and Actions remain available, including eligible card reveals.

`POST /[lang]/quick-game` accepts `Accept: application/json` and returns
`201 { gameId }`, with the existing identity and last-visited cookies. Unsupported
locales return 404; creation failures return 500 with a sanitized `{ error }`.
Homepage forms retain the 303 localized redirect and plain-text errors. Replay
creates a distinct private six-seat table using server-selected random Quick Play
bots (rules bots only with external inference disabled), and fully navigates there.
Repeated clicks are guarded while “Starting…” is shown. Failure keeps the current
table intact and displays a localized retryable error without automatic retries.
Replay never resets stacks, releases seats, or moves other players; watching deals
only on request. No persisted status or migration is added.

### Completed hands and Actions

Completed hands show each winner’s awarded chips centered in the sizing area,
with an explanation for opponents folding or the public showdown hand category.
These are winnings, not net profit. Multiple winners are listed as “Pot awards”
since separate side pots do not necessarily constitute a split pot. Results use
current authoritative public game state, survive refresh and feed failures, and
clear when the next hand begins. The hidden sizing controls preserve the tray’s
height, keeping action buttons in place between hands on desktop and mobile.
Card-reveal and control permissions are unchanged.

Actions is the player-facing timeline on desktop and in the mobile sheet. The
browser initially loads the latest 50 hands, then requests `/feed?sinceHand=N`
from the last cached hand, inclusive. It replaces that hand and any newer hands,
retains older completed hands in memory, and keeps the combined feed bounded to
50 hands. Authoritative game refreshes drive synchronization, including catch-up
after reconnecting and retries after feed failures. Reloading fetches the recent
history again. Supabase Broadcast remains a refetch signal.

Apply `20261011000000_add_incremental_game_feed.sql` before deploying incremental
feed loading. It adds the service-role-only `get_game_feed_since` RPC; the existing
full-feed RPC remains available. No backfill is required. To verify SQL filtering,
ordering, bounds, and access grants against migrated local Supabase, run
`docker exec -i supabase_db_ai-holdem psql -U postgres -d postgres -v ON_ERROR_STOP=1 < test/sql/incremental-game-feed.sql`.
The verification fixtures are rolled back.

Your
own actions and blinds use bold text; spectators see a neutral feed. Win lines
use slightly larger green text and a thin separator to distinguish outcomes from
moves. Street headings show only the board cards already supplied by public feed
events. The panel follows updates within 24 pixels of the bottom; scrolling up
pauses following, and Latest action resumes it. Reopening starts at the latest
event. The debugging History button and modal are available only in development
(`npm run dev`); production builds, including deployed previews, hide them and
do not load history for the modal. The history API retains its existing access
and privacy rules.

Apply `20261010000000_add_action_seat_to_game_feed.sql` before deploying this
application change. It preserves the feed’s hand limit, ordering, server-only
snapshots and grants, and adds each action’s seat for identity resolution against
the immutable initial hand configuration. No backfill is required. Legacy rows
without usable identity return a null player ID and are never matched by name.

## Consistent game-state reads

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

Apply `20261012000000_add_game_read_snapshot.sql` **before** deploying the reader.
It is additive and requires no game backfill. With local Supabase running and all
migrations applied, run `npm run test:sql:game-reads` and
`npm run benchmark:game-reads`. These use local credentials from the Supabase CLI,
create and clean up their own fixtures, and preserve existing games. See
[benchmark methodology and measurements](benchmarks/game-reads.md). Unit tests
remain offline, and there is no latency threshold in CI.

Seat claims, bot assignments, and releases use versioned atomic RPCs through
`lib/poker/seat-service.ts`. Host permissions come from the durable host record,
including when the host is unseated; missing records grant no host authority.
Mutation responses parse the committed RPC seat row without rereading seats.
Run `npm run test:sql:seats` with migrated local Supabase, Docker, and Supabase CLI
to check locking, conflicts, retries, moves, permissions, and release states using
isolated fixtures. See [contributor testing instructions](CONTRIBUTING.md).
