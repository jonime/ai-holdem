<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI Hold'em Project Guide

## Purpose

This is a TypeScript no-limit Texas Hold'em game with one-click private
six-seat play and customizable 2–6-seat tables. Humans and provider-backed AI
seats occupy the table, including TypeSafe, deterministic offline `Equity
Rules`, and configurable LLM bots, while
`@hivetech/poker-engine` remains authoritative for cards, turns, legal actions,
betting, pots, and winners. Supabase persists game state and version-checked
mutations; Realtime Broadcast only tells clients to refetch authoritative state.

This repo is security-sensitive and architecture-sensitive. Treat the current
code, tests, and live behavior as the source of truth. Do not rely on older
plans, assumptions, or stale notes when they conflict with the implementation.
Changes that weaken validation, privacy boundaries, or concurrency guarantees are
not acceptable.

The files in `plans/` explain the design sequence and security decisions. Use
them for context, but prefer the current code and tests when a plan describes an
earlier state.

## Setup

- Use Node.js 24 or newer. The repository includes `.nvmrc` for Node 24.
- Install exactly from the lockfile with `npm ci` (use `npm install` only when
	intentionally changing dependencies).
- Copy `.env.example` to `.env` and provide the documented values, including the
	optional LLM bot settings used for external inference and server-owned
	playstyles.
- Apply every file in `supabase/migrations/` in filename order to a Supabase
	project. Never edit an already-applied migration; add a new timestamped one.
- Start the app with `npm run dev`; it listens on `http://localhost:3001`.

## Documentation Maintenance

- Treat project docs as part of the implementation. Stale guidance is a product
	bug.
- Keep `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, and any other project docs
	synchronized with the live codebase and current workflows.
- Keep `README.md` focused on the project overview, essential local setup,
  basic development/deployment commands, and links to deeper documentation.
  Do not append a section for every new feature or use it as a changelog.
  Update it only when a change affects that introductory scope; keeping docs
  synchronized does not mean documenting every change in every file.
- Keep the README's **References and inspiration** list current when sources
  supplied by the user or consulted during development materially inform the
  project's design, implementation, strategy, or evaluations. Review new sources
  for inclusion and update attribution in the same change that uses them. Give
  each entry a direct source link and a brief, accurate description of its role;
  routine documentation lookups do not need an entry. Keep detailed attribution,
  adaptation differences, and evaluation limits in the relevant guide or benchmark
  document, linked from the README. Distinguish inspiration from reused code or
  data, and preserve any required license notices.
- Document feature behavior in `docs/gameplay.md`, implementation details in
  `docs/architecture.md`, rollout/migration prerequisites in `docs/deployment.md`,
  and contributor workflows/checks in `CONTRIBUTING.md`. Use focused guides such
  as `docs/fair-use.md` where appropriate. Extend the relevant existing section
  instead of duplicating feature, migration, or test details in the README.
- When a repo rule, setup step, environment variable, command, or workflow
	changes, update the relevant docs in the same change.
- Do not leave outdated instructions in place just because the code still works
	by accident; fix the docs with the change.
- If the implementation and the docs disagree, the implementation wins; the docs
	must be corrected immediately.

## Required Checks

Run `npm run check` after code changes. It runs ESLint, the strict TypeScript
check, and the Vitest suite. Run `npm run build` for changes affecting Next.js
routing, rendering, environment handling, or deployment behavior.

Pull requests and pushes to `main` retain the fast check/build job with non-secret
placeholder values; unit tests must not depend on live Supabase or TypeSafe.
An independent 30-minute integration job uses Docker, pinned Supabase CLI 2.120.0,
and the installed Playwright Chromium and WebKit with system dependencies.
Browser/system dependency installation and Supabase setup overlap through
`scripts/e2e/ci-setup.mjs`; both must exit successfully before checks, and setup
failures wait for both tasks to exit before unconditional teardown. Supabase registry
images are pulled normally during startup; do not cache Docker image archives,
containers, volumes, or database state. Archive restore/load overhead exceeded
the avoided pull time in measured CI runs. Every run starts a
healthy full local stack (including Realtime), applies every migration to its
disposable database, then runs `db:types:check` before `test:sql:game-reads`, `test:sql:replay`, `test:sql:creation`, `test:sql:my-games`, `test:sql:removal`, `test:sql:bot-context`, `test:sql:seats`,
`test:sql:departures`, `test:sql:turn-timers`, `test:sql:bot-claims`, `test:sql:usage`, `test:integration:bot-pipeline`, and `test:e2e:ci` in order.
The bot-pipeline suite requires an already-running migrated local stack, injects
only deterministic `BotRegistry` decisions, and retains real creation, context,
authorization, claims, allowances, legality and persistence. Its isolated Vitest
process loads no application/test environment files or provider credentials,
blocks non-loopback network requests, and removes/verifies only fixture-owned
games, histories, claims, creation attempts and allowances. It does not test
provider HTTP or playing strength. Preserve failing production invariants and
report defects without silently expanding test-only changes. See CONTRIBUTING.md.
Startup/migration errors fail the job; never ignore
health checks. Preserve workflow cancellation for superseded commits.

Local production browser verification requires an already-running migrated local Supabase and
Chromium and WebKit (`npx playwright install chromium webkit`). The shared production runner exposes
`test:e2e:smoke` (`@smoke`), `test:e2e:ui` (`@ui-regression`), `test:e2e:webkit` (`@compatibility` on desktop/mobile WebKit), and `test:e2e:ci`
(Chromium smoke/UI plus both focused WebKit projects). CI builds once and runs one Playwright invocation/report. The UI suite
contains dialog, betting-controls, hand-results/Actions, request-recovery, table-loading fallback, and turn-notification tests. Local
smoke/UI commands retain file filters and explicit grep overrides; the combined
command accepts only `--list` and rejects selection overrides. Empty selections
must fail. Each command builds an
isolated copy without application `.env*`, uses `.next-e2e` and port 3002, and
starts `next start` with identical local build/server environment values. Never
reuse a server or read hosted credentials. Validate loopback status origins,
mask credentials, disable external inference, and clear provider credentials.
Reject `E2E_BASE_URL` in CI; keep development and explicit preview modes outside
CI. The lifecycle `@smoke` tests cover Quick Play, unseated host seat authority,
Equity Rules completion/Actions feed/next hand, real two-browser Realtime game/seat
events, and intentionally blocked WebSocket polling recovery. Keep Chromium coverage unchanged and WebKit limited to compatibility tags, with
one worker and no retries. WebKit emulation is not physical-iPhone Safari
certification; record the real-device checklist in CONTRIBUTING.md separately. Ordinary local production browser/SQL commands never reset the DB.

Keep failure traces/screenshots, HTML reports, and sanitized application/startup
logs in `test-results/`, `playwright-report/`, and `integration-logs/`; upload CI
diagnostics for seven days. Never upload status/environment dumps, service-role
keys, database contents, or production data. Always tear down the application
and CI Supabase even after failures; local production verification preserves the running stack.
See `CONTRIBUTING.md` for prerequisites, selection and artifact inspection. This
integration job does not replace the Vercel two-browser lifecycle smoke test.

## Architecture Rules

- Keep `lib/supabase/database.generated.ts` unchanged from pinned CLI 2.120.0
  generation against the fully migrated local public schema. After schema changes,
  apply migrations locally, run `db:types:generate`, then `db:types:check` and
  `check`. Type commands never load application environment files, use hosted
  credentials, reset databases, or migrate automatically. Keep server-only JSON
  and SQL-nullability refinements in `lib/supabase/contracts.ts`; generated types
  never replace runtime response/state validation. Preserve typed RPC argument
  relationships and table writes/filters through repository helpers and doubles.
- Keep third-party poker-engine details behind `lib/poker/adapter.ts`. Inspect
	the installed package declarations and behavior before using an engine API.
- The poker engine, never TypeSafe output or client input, decides legality.
	Validate a proposed action, apply it through the adapter, then persist it.
- Only hosts and owned seated human players may advance bots, including folded or
  eliminated seated humans and unseated bot-only hosts. Spectators only refetch.
  Check ownership before provider resolution or inference; unauthorized steps return
  403. One browser runs one bot loop. Every production bot step, including rules,
  requires a service-role-only 90-second database-time claim before provider
  resolution or context preparation. Only the matching unexpired token can commit
  an action or credit departure; commits consume the claim atomically. Cleanup is
  token-matched and best-effort, with no lease renewal or transaction during inference.
  BOT_STEP_IN_PROGRESS (409) waits quietly for Realtime/polling; unchanged versions
  at the bounded wait expiry require explicit retry. BOT_STEP_CLAIM_LOST (409)
  refetches immediately and requires explicit retry if the same turn remains.
  Version conflicts stop the stale loop and refresh silently; refresh and provider
  failures stay visible. Claims never change versions or publish notifications.
  Apply 20261015000000_add_bot_step_claims.sql before application code; full
  deduplication starts after old instances drain. Expiry permits crash recovery,
  but this does not guarantee exactly-once provider billing.
  Provider requests share a server-only 60-second deadline covering headers and body.
  Temporary failures return allowlisted BOT_* codes with HTTP 502 and pause the
  failed hand/actor turn, including across polling/version-only refreshes. Retry
  explicitly refetches authoritative state and prevents parallel loops; no retries
  or fallback actions run automatically. The bot-step route requests 90 seconds
  on Vercel; verify the deployed effective duration before release.
  Stop at human turns, completed hands, navigation, or lost eligibility. Next hands
  require explicit interaction; bots pause without an eligible open browser.
- Confirmed LLM credit failures apply one engine-validated fold and mark the seat
  leaving atomically through `commit_bot_departure_with_claim`, which wraps
  `apply_ai_action_and_leave_if_version`; next-hand
  reconciliation removes it. Apply `20261014000000_add_atomic_bot_credit_departure.sql`
  before deploying the code. OpenRouter temporary in-flight spending holds and
  rate limits remain paused, as do undocumented Jev credit failures. Preserve
  safe structured LLM/Jev HTTP logs and the localized credit-departure notice;
  never log raw provider messages, inputs, responses, headers, keys or cards.
- Header Lobby preserves seats and navigates to localized Play. Leave table is
  available for an owned claimed non-departing human only when another human
  has a claimed seat, including folded/eliminated/departing humans. With no other
  claimed human, Lobby navigates directly without confirmation or departure.
  Leave table confirms and navigates only after an acknowledged departure;
  Stand up shares the departure service and stays watching.
  Deploy `20261019000000_add_human_departures.sql` before application code. Active
  human departures are irreversible and fold only on their legal turn; all-ins
  keep pot eligibility. Atomic departure/advance RPCs lock the game row and recheck
  version, identity, ownership/driver eligibility and leaving state. Ordinary human
  actions cannot bypass departure and history records the actual fold. Completion
  clears departing human assignments in the action transaction, preserving immutable
  participants, awards, identities and ownership-aware cards/reveals. Public
  `poker.seats` separates live assignments from immutable completed participants;
  mask other tokens and every legacy Broadcast seat token. Durable hosts
  and usage attribution persist. One client loop advances bots or departing humans;
  only bots use claims/providers/allowances. No background worker or disconnect
  timeout exists. Run `test:sql:departures` and production departure browser smoke;
  CI includes departure SQL coverage. Verify notifications on authorized Vercel.
- Server-route failure logs use `lib/logging/application-failure.ts` with only
  allowlisted operation/category, numeric response status and an internal generated
  UUID reference. Never log exceptions or arbitrary metadata. Preserve expected
  error returns, silent personal-list reads and specialized provider diagnostics
  without duplicate events. Direct route `console.error`/`console.warn` is linted;
  browser Realtime diagnostics use fixed text without table IDs. See the logging
  sections in `docs/architecture.md` and `CONTRIBUTING.md`.
- Each mutation applies at most one action and uses the expected game version.
	Preserve optimistic-concurrency conflict handling in service and API layers.
- Game refreshes use one uncached, service-role-only `get_game_read_snapshot`
  RPC. Its single SQL statement consistently reads game state, ordered seats,
  nullable host/listing, and current-hand reveal IDs. Keep the snapshot server-only
  and apply ownership/privacy/publication filtering in TypeScript. Reveal reads,
  including mutation responses, filter both game ID and hand number in SQL.
  Apply the additive snapshot migration before application code; no backfill.
- Postgres is the source of truth. Realtime events are best-effort wake-up
  signals; clients refetch and must continue to work if Broadcast is unavailable.
  After successful mutations, use the shared Next.js `after()` scheduler; never
  detach publishing promises. Capture only validated compact envelopes: game
  events `{ type, gameId, version }` with the committed version, seat events
  `{ type, gameId }`. Reject extra outgoing fields; no notification-only reads.
  Await one send (five-second Supabase timeout) and channel cleanup. Scheduling
  and delivery failures preserve HTTP success; log only event identifiers,
  phase, and elapsed time. Clients normalize validated legacy envelopes to
  refresh signals, filter stale game versions, always refresh matching seat
  events, and retain debounce/coalescing and polling. Verify lifecycle changes
  with the two-browser smoke test on a Vercel deployment containing the change
  (a preview, or an explicitly authorized live site);
  local tests alone cannot prove the deployed response lifecycle.
- Public discovery is opt-in and lease-backed. Missing `game_listings` rows are
	private; only waiting games with an open seat and an unexpired two-minute host
	lease are listed. Visible hosts renew every 30 seconds without changing the
	game version or broadcasting. Shared directory caching is limited to
	visitor-independent candidate pages with a short lifetime; host/seated
	exclusions remain request-specific. Successful directory-affecting mutations
	invalidate the candidate cache. No cleanup scheduler is used.
- Public action-feed identities come from each hand’s immutable initial configuration,
  resolved by action seat; never match by display name. Legacy identities are null.
  Completed-hand results use authoritative public game awards independently of feed loading.
  Feed synchronization initially loads 50 recent hands, then replaces the inclusive
  range from the last cached hand through `/feed?sinceHand=N`, retaining at most
  50 hands in browser memory. Serialize requests, retry failures on subsequent
  authoritative refreshes, and discard previous-session responses. Apply the
  incremental-feed migration before deploying its application code; ranged reads
  remain service-role-only and filter hands in SQL before loading their actions.
- Public DTOs are a security boundary. Reveal active hole cards only to the
	browser that owns that seat. Do not broadcast private cards, player tokens,
	TypeSafe inputs, or raw responses.
- Keep `SUPABASE_SECRET_KEY`, `TYPESAFE_API_KEY` and `EEVO_API_KEY` server-only. Never add a
	`NEXT_PUBLIC_` prefix or import server modules into client components.
- Translations are server-owned. Every dictionary module is `server-only`;
	Server Components load them through `lib/i18n/server`, and client components
	receive the game route's `I18nProvider`. The cached landing route uses only
	server-rendered locale links and plain anonymous-game POST forms. Quick Play
	must atomically create an already-playing private six-seat game with five bots
	selected from the available catalog; external inference disabled means rules
	bots only. Rules and TypeSafe bots use medium difficulty, while LLM bots use
	random server-owned playstyles. Custom tables retain their six-seat default and 2–6-seat lobby.
	Never import dictionary values into client components or shared client utilities.
- English HTML pages use unprefixed URLs through `app/(english)` wrappers
  that reuse the shared locale pages and layouts with `en-US` params. Other languages retain locale prefixes such as `/fi-FI`.
  Never redirect according to browser language. Old `/en-US` URLs permanently
  redirect to the unprefixed equivalent, preserving paths, queries and methods.
  Use `addLocalePrefix` for public URLs; English canonical URLs and `x-default`
  are unprefixed. Preserve page caching and `Vary: Accept` content negotiation.
- In-game Help is optional server-only MDX in `content/help/`, loaded by the explicit
  locale map in `lib/help/server.ts` and passed as rendered content into `PokerApp`.
  Keep all locales complete and update relevant documents when controls or gameplay
  terminology change. Only interface labels belong in game dictionaries. Help shares
  the single overlay state and never pauses bots, timers, refreshes or notifications.
- The About route is Markdown-authored but remains server-only. Load its MDX
	through `lib/about/server`; do not add `use client`, client providers, runtime
	content fetching, or imports from the About documents into client modules.
- SEO metadata remains server-owned in `lib/seo.ts` and the metadata dictionaries.
  Only durable public content belongs in the sitemap. Game pages and the public
  directory use `noindex, follow`; robots guidance is not an access-control boundary.
  The canonical origin defaults to `https://www.aiholdem.gg`, independently of
  the Vercel deployment hostname; `NEXT_PUBLIC_APP_URL` overrides it with a
  custom canonical HTTP(S) origin at build time.
  When replacing `public/social-preview.png`, keep its dimensions and alt text
  in `lib/seo.ts` synchronized with the committed asset.
- End-of-table UI derives from authoritative public stacks, participation, and the
  completed-hand table winner. Unresolved all-ins are not elimination. Keep
  next-hand eligibility shared by buttons, shortcuts, and the handler. Watching
  advances manually; New Quick Play creates a distinct private randomized six-seat
  game through the localized quick-game endpoint, retaining identity cookies and
  guarding pending requests. Preserve final results, Actions, and eligible reveals.
- Anonymous player tokens support this game's seat ownership; they are not
	production authentication. Knowing a game URL intentionally permits viewing.

## Debug history removal

Apply `20261018000000_remove_debug_history.sql` before deploying the debug-history
removal. It drops the inspection RPC, `ai_decisions` table (including existing
debug records), and its trigger function. Hands, actions, inference context,
claims, credit departures and reveals remain available. Legacy bot action RPC
inspection parameters are retained and ignored for rolling deployment
compatibility; the application sends null for inspection payloads.

## Code Map

- `docs/`: gameplay, architecture, and deployment reference guides linked from
  the README. `benchmarks/README.md` indexes evaluations and policy benchmarks.
- `app/api/games/`: HTTP boundary for game creation, actions, seats, feed,
	AI stepping, and hand transitions.
- `lib/poker/`: domain types, engine adapter, public projections, and game
	orchestration. `bot-turn-service.ts` owns claim-protected bot execution and the
  legacy claim-free test seam; `game-service.ts` retains other game lifecycle work.
  The services share `driver-authorization.ts`, `game-errors.ts`,
  `persisted-state.ts`, `game-projection.ts`, and `game-service-contracts.ts`
  without importing each other. Shared modules never resolve bot providers.
  `seat-service.ts` owns atomic claim, bot assignment, and release;
  `seat-contracts.ts` and `host-authorization.ts` hold dependency-neutral contracts
  and durable host authorization. Seat mutations require an expected version and
  parse the RPC-returned seat without a follow-up seat query.
- `lib/supabase/`: persistence parsing and repository implementation.
- `lib/typesafe/`: System One HTTP client and constrained decision validation.
- `lib/http/*-contracts.ts` and `lib/http/api.ts`: feature-specific, browser-safe inferred contracts and runtime-validated named methods for every application-owned JSON endpoint. Browser UI uses this transport boundary; HTML forms/redirects, Realtime and external provider clients remain separate. See the endpoint checklist in `CONTRIBUTING.md`.
- `lib/realtime/`: server publishing and client refetch subscriptions.
- `lib/i18n/`: locale helpers, server-only dictionary loaders, and per-locale
	dictionaries split by route group (`metadata`, `landing-server`,
	`join-game`, `play`, `game`) under `lib/i18n/dictionaries/`.
- `content/about/`: localized MDX for the server-only About route; every locale
	exports its own title and description metadata and follows the same heading
	structure.
- `components/poker/`: client game, lobby, and spectator experience.
  `bot-lifecycle.ts` owns pure bot state transitions; `useBotLifecycle.ts` owns
  advancement, waits, provider pauses, usage countdowns, retries and generation
  guards. `useGameSession.ts` retains authoritative state/reconciliation, response
  sequences, polling/Realtime, feed and non-bot mutations. See the compact
  transition table in `CONTRIBUTING.md`.
- `supabase/migrations/`: ordered schema and atomic RPC changes.

## Change Guidance

- Put orchestration and validation in services, not route handlers or React
	components. Routes should parse input, call the service, and map known errors.
- Parse persisted and external data defensively. Do not replace runtime checks
	with unchecked TypeScript assertions.
- Add focused tests beside the owning module. Cover rejected stale, illegal,
	unauthorized, or privacy-sensitive paths as well as successful behavior.
- Keep UI assumptions based on seat/controller data rather than hardcoding
	seat 0 as the human or seat 1 as the AI.
- Preserve secret masking before changing API responses, history, spectator
	views, or Realtime payloads.
- Directory joins and lobby seat mutations must stay in atomic, version-checked
	RPCs that lock the game row. Apply the public-directory migration before the
	application code; existing games require no listing backfill.

## Client request recovery

In-game mutations have 15-second client transport deadlines; bot steps have
100 seconds. These cover headers/body and compose with caller cancellation.
Transport failures and invalid successes mean unknown outcomes: reconcile once
without replay, then require a new explicit decision. Failed recovery blocks
mutations behind Refresh table. Bot unknown outcomes stay paused on the same
hand/actor across version-only refreshes until explicit retry. Abort clients and
fence late results by session generation on navigation; never release server
claims from client cancellation. Read/feed and creation/discovery deadlines are
unchanged. See CONTRIBUTING.md for deadline ownership and recovery details.

## Local game-read verification

With local Supabase running and all migrations applied, run
`npm run test:sql:game-reads` for SQL role, hand filtering, nullable rows, and
cross-connection committed snapshot checks. Run `npm run benchmark:game-reads`
for original/snapshot request counts, response bytes, median/p95, and reveal
query plans. These local-only scripts preserve existing games and clean up their
own fixtures; they require Docker and Supabase CLI. No noisy latency CI threshold
is used. See `benchmarks/game-reads.md` for methodology and recorded results.

## Local seat-mutation verification

With local Supabase running and all migrations applied, run `npm run test:sql:seats`.
The local-only runner uses isolated fixtures and independent connections to check
game-row locking, competing claims, stale versions, idempotent retries, atomic
moves, durable host authorization (including unseated and missing hosts), and
waiting versus non-waiting release behavior. It requires Docker and Supabase CLI,
also checks atomic LLM credit folds/departures, stale retries, restricted SQL
roles, and rollback after a departure failure. It cleans up its fixtures and
never loads application `.env` or calls bot providers.

## Bot scenario evaluations

`npm run test:bots` evaluates real bots against deterministic engine-backed
scenarios, with separate bot/model, difficulty (or LLM playstyle), and scenario
test groups. LLM groups cover every server-owned playstyle; filter them with
`-t 'my-llm.*tight'`. Select
groups with Vitest `-t`; external provider groups are skipped unless
`BOT_SCENARIO_LIVE=true`. The command exits nonzero on illegal actions, listed blunders, or provider
failures. It is separate from CI; fixture and evaluator regression tests run in
`npm run check`. See `benchmarks/scenarios/README.md` for opt-in live provider
commands and known weaknesses. Preserve production context options and do not
weaken strategic expectations to hide a failing bot.

The benchmark-only Equity Rules challenger lives in `benchmarks/equity-rules/`.
Run `npm run benchmark:equity-rules` for frozen/facts/structured ablations with
500 whole seed blocks per opponent/difficulty at two and six seats. Three through
five players have fixed-decision coverage; supplied range equity is limited to
separate heads-up fixed decisions. See `benchmarks/equity-rules/README.md` for
sampling budgets, worker isolation, fallback coverage and bootstrap exclusions.
No production selection, provider, session query or persistence changes are allowed;
promotion requires a later evidence-based plan.

Vitest automatically loads the optional root `.env.test` file for unit tests and
benchmarks before collecting tests. Existing shell/CI variables take precedence;
`.env` is not loaded. `.env.test` is ignored by Git and can hold local provider
credentials. Live bot evaluations still require their explicit opt-in flags.

## Shared Jev/LLM context and evaluations

Use `get_bot_session_context` for Jev/LLM inference history and bounded previous-hand
statistics; Equity Rules retains `get_bot_hand_context`. Apply
`20261028000000_add_bot_session_context.sql` before deploying the session-context code.
The stable RPC bounds the latest 50 completed hands before loading actions. Replay
historical states server-side; send only versioned seat-relative aggregates, never
historical holdings, identities, tokens or outcomes. Attribute only through immutable
identity plus ownership/controller/configuration continuity; gaps or changes reset
older attribution. Keep dealt-heads-up/multiway statistics separate, opportunity
counts explicit, zero opportunities unknown and fewer than ten insufficient for
opponent-specific adaptation. This threshold is a product default, not a guarantee.
Exclude identifiable forced departures; never infer intent or compensate for prior
folds. Both providers receive shared advisory guidance with unchanged output contracts.
Production models stay unchanged during the capped 640–1,000-request OpenRouter pilot;
no fallback/substitution or automatic retry. Freeze current policies in benchmark
baselines and exclude incomplete paired match blocks from chip comparisons.
Apply `20261013000000_add_bot_hand_context.sql` before app deployment. Resolve
actors by authoritative pre-action engine turns and immutable hand configuration.
Validate the version and replay before inference; incomplete legacy history is
unknown, database failures remain visible, and mismatches use conflict/refetch.
Only allowlisted visible facts may enter provider requests. Facts and guidance
are server-owned with independent versions. LLM advice is original and advisory;
it never removes candidates or overrides exact river safeguards or playstyles.
Keep Equity Rules strategy outside this policy change.

Run `npm run benchmark:poker-context` offline and `npm run test:sql:bot-context`
against migrated local Supabase. Live evaluations require explicit inference
opt-ins and a supplied shared `BOT_DECISION_CALL_CAP`. Separate deterministic
correctness from playing strength. See `benchmarks/poker-context.md`.

## Anonymous fair-use admission

See [docs/fair-use.md](docs/fair-use.md) for provisional server-owned allowances,
privacy, proxy assumptions, and rollout. Deploy
`20261016000000_add_usage_admission.sql` and the server-only
`USAGE_LIMIT_HASH_SECRET` (at least 32 random bytes) before application code.
All creation endpoints share owner/IP counters; external TypeSafe/LLM attempts
charge the durable table host and game only after context validation and claim
verification. Rules turns bypass inference allowances. Denials preserve tables
and require explicit retry; rules-only Quick Play creates a separate private game.
Run `npm run test:sql:usage` against migrated local Supabase; CI includes it before
production browser smoke. The smoke suite also covers fair-use countdowns,
explicit retry, rules replay, and localized HTML/typed JSON creation denials.

## Play discovery

`/[lang]/play` streams personal summaries and public directory data through independent
request-time Suspense boundaries. Keep cookies out of the cached landing page.
`list_my_games` is service-role-only and discovers durable hosts or claimed human
seats in SQL, deduplicating before activity ordering and the five-item limit.
Apply `20261026000000_add_personal_summary_composition.sql` before the matching
application: it replaces `list_my_games` with human/bot assignment counts and
`viewerSeated`, without a compatibility RPC. Claimed departing/eliminated humans count
until release. Personal rows preserve public custom titles, use descriptive unnamed
labels with short IDs, and show hydration-safe UTC/relative update text without timers.
Personal API responses, including errors, are private/no-store; never log lists or
repository errors or put personal summaries in shared caches or Realtime. No polling
or subscriptions run on Play. Localized `/join-game` permanently redirects to Play.
Apply `20261017000000_add_my_games.sql` before application deployment and run
`npm run test:sql:my-games`; CI includes rollback-only SQL and production Play smoke.

## Personal table removal

Apply `20261025000000_add_host_personal_removal.sql` before deploying host personal
removal. Hosts with other claimed humans can use **Remove from my tables** without
deleting shared history. This host-only `remove_from_list` operation atomically
departs the caller’s own human seat, if any, and records a private exclusion.
Unseated hosts only hide the row and keep the game version unchanged. Durable host
authority remains; URL visits do not restore the row, but successful non-departing
seat claims do. Whole-table deletion still blocks on every other claimed human.


Deploy `20261020000000_add_table_removal.sql` and
`20261021000000_grant_table_removal_reveal_delete.sql` before application code.
The latter explicitly grants service-role DELETE on card reveals; local default
privileges may mask a missing hosted grant. Personal
summaries include version and caller-specific removal capability, never ownership
tokens. Host deletion locks the game row and blocks on every other claimed human
assignment, including folded, eliminated or departing humans. History is deleted
before restrictive seat references; usage allowances survive. Joined removal
prepares folds through the adapter, then atomically registers departure and a
private listing exclusion. Exclusions precede ordering/limits and clear only on
successful non-departing seat claims, including directory joins. Keep compact
seat refresh signals in `after()`, polling recovery and terminal localized 404
handling that stops advancement. Run `test:sql:removal` and production removal
browser smoke, then verify two-browser notifications on authorized Vercel.

## Human turn timers

New custom tables explicitly configure `humanTurnSeconds: 60`; Quick Play uses null.
Only null/30/60/90 are accepted. Existing games remain Off. Timer eligibility freezes
at hand start for at least two dealt humans. Only adapter facts determine the next
actionable human. Keep timer writes in the action/start transaction using database
time and fresh decision IDs; unrelated versions and reads must preserve deadlines.
Ordinary actions cannot commit at/after expiry. Hosts and owned seated humans may
advance one timeout check/fold under lock; departures retain fold precedence.
Timeouts use no providers, claims or allowances and never remove seats or start hands.
Preserve the snapshot read and shared client lifecycle; use server samples plus
monotonic elapsed time, text warnings, explicit retry and navigation guards.
Apply all three 20261022–20261024 timer migrations before application code, run
`test:sql:turn-timers` and production timer browser smoke, and verify two-browser
notifications on an authorized Vercel preview before release.

## Turn notifications

`useTurnNotifications` owns the localized steady tab title and optional Web Audio
cue. `turn-notifications.ts` tracks observed game/hand/street/actor transitions
(and server timer decision IDs) separately from temporary eligibility. Preserve
initial-load/visibility-return suppression, ownership/departure/deadline checks,
mutation/recovery/offline suppression, guarded title cleanup, gesture-only audio
unlock, shared versioned Settings preference storage, and best-effort background behavior. Modals do
not change turn eligibility. Separate tabs may each notify; do not change polling.

## In-game Settings

Settings shares the single overlay and Modal with Help, Join and mobile Actions.
`useSettings` owns `ai-holdem-settings` version 1 with turnSound false and
gameplayShortcuts true, showCurrentHand true and cardColours "classic" by default.
Current-hand categories are adapter-evaluated only for the owned participating,
non-folded/non-departing human on flop/turn/river using revealed cards; all-ins qualify.
Keep categories null for everyone else, preflop and completion, and absent/null in
legacy Broadcast. Explicit viewer identity drives every Seat layout; Settings only
controls display; every seat reserves the same category slot and status/action text
floats on its bottom border without affecting equal, fixed seat dimensions. Card colours accepts
"classic" or "four-colour"; old version-1 entries default the missing field to
Classic. Game-scoped suit CSS variables also colour server-rendered inline Help
examples, with unchanged symbols, accessible names and card geometry. Read after
hydration before attaching gameplay shortcuts; validate storage and synchronize storage events, including removal.
Ignore legacy sound storage. `useTurnNotifications` receives sound preference
and previews only explicit user enabling, never storage changes. Disabled gameplay
shortcuts hide custom hints and aria-keyshortcuts and preserve native controls.
Language remains URL-owned; use native locale names and addLocalePrefix for the
same game, preserving query/fragment and identity. Guard language changes during
mutations, bot advancement, replay, recovery and navigation. Settings stays usable
and never pauses game updates, timers or notifications.

## Duplicate-safe creation

Initialized JavaScript creation captures a UUID and inputs, verifies the anonymous
cookie, and offers explicit same-attempt retry/reload recovery with a 15-second
deadline. Pending session records contain only inputs and a one-way identity
fingerprint, never ownership tokens. Keep cached landing HTML visitor-independent
and preserve native forms (without duplicate-safe retry guarantees). Deploy
`20261027000000_add_creation_attempts.sql` first. Its service-role-only atomic RPC
returns matching results before charging allowance, conflicts on changed intent,
rolls back failed creation, and retains permanent deletion tombstones. No automatic
retention expiry; never log attempt IDs, fingerprints, names, tokens or payloads.
Run `test:sql:creation`, `test:sql:usage` and `test:e2e:ci`.

## Upright Eevo

Eevo (`eevo`, `eevo-1`) uses the shared provider-neutral `lib/systemone/` policy
pipeline with Jev's unchanged prompts, difficulty sampling and river safeguards.
New selections require its server-only `EEVO_API_KEY` plus enabled external
inference; existing descriptors remain parseable without credentials. Quick Play
excludes Eevo unless `EEVO_QUICK_PLAY_ENABLED=true`. It has difficulty controls,
no LLM playstyles and no automatic credit departure. Preserve claims, allowances,
60-second requests and explicit retries. Apply `20261029000000_add_eevo_bot.sql`
first, drain old instances before adding the secret, and keep Quick Play disabled
for the initial trial. Clear/reject Eevo keys in isolated environments. Live
scenario evaluations require explicit inference opt-in and a shared call cap.

## Confidence-aware opponent advice experiment

The benchmark-only Plan 3 challenger lives in `benchmarks/opponent-advice/`.
Run `npm run benchmark:opponent-advice` for the offline 960-decision matrix.
`benchmark:opponent-advice:live` requires fresh explicit paid authorization, both
inference opt-ins, the confirmation token and a shared cap at most 960.
It changes no production policy or persistence and makes no automatic retries.
See [the experiment guide](benchmarks/opponent-advice/README.md) for source
freezing, eligibility, evidence limits and sanitized partial reports.

`benchmark:opponent-advice:v2` tests corrected target-only omission controls
offline, preserving the initial paid pilot's v1 source freeze. A separately authorized v2 pilot uses `benchmark:opponent-advice:v2:live`,
a new 960-call cap, no-inference network preflight and a shared first-failure stop. See the experiment guide for the original network-failure ledger,
remaining-cap continuation and the v1 history-control limitation.

The corrected 960-call pilot completed with zero failures; its authorization is
exhausted. Preserve v1 and v2 evidence separately. See the [v2 report](benchmarks/opponent-advice/live-v2-report-2026-10-14.md)
for Jev's heads-up pressure response and extreme sizing. No production promotion
or further paid evaluation follows automatically.


## Production Jev and Eevo confidence advice

The registry uses `ConfidenceAwareJevPokerBot` (`typesafe-poker-v4.1-confidence`)
for Jev and `ConfidenceAwareEevoPokerBot` (`eevo-poker-v4.1-confidence`) for Eevo.
Both share the same advice-envelope builder. `lib/poker/opponent-advice.ts` owns server-only Wilson-qualified
fold interpretation (`jev-opponent-advice-v2`), ten-opportunity minimum, situational
matching and explicit sizing caveats. Do not interpret counts as current fold
probabilities or endorse all-ins from them; preserve every candidate and the
base engine/river safeguards. Eevo retains its own model/client/error mapping;
LLM, rules, models, persistence, claims,
allowances and request deadlines remain unchanged. The old wrapper stays a
benchmark baseline; reconstruct frozen Plan 3 experiments at archival commit
`62d7bc6` instead of rewriting paid-run hashes after promotion.

## Production bot predictability audit

`benchmarks/bot-audit/` evaluates current registry confidence-aware Jev/Eevo,
explicit mini/low/balanced LLM settings and production Equity Rules at fixed
decisions. `benchmark:bot-audit` disables external inference;
`benchmark:bot-audit:analyze` reads sanitized evidence without credentials. The
frozen `benchmark:bot-audit:live` pilot requires fresh explicit paid authorization
for 972 decisions, consumes failed allocations and refuses replay of an existing
ledger. Preserve native Monte Carlo/hash differences separately from controlled
equity comparisons. No production policy changes follow from concentration alone.
See [the guide](benchmarks/bot-audit/README.md).

The frozen 972-request bot audit completed on 2026-10-15 with 957 accepted
provider decisions and fifteen Eevo river-split failures. Its authorization is
exhausted; preserve its ledger/evidence and do not replay it or add paid probes
without fresh explicit authorization. See the
[paid audit report](benchmarks/bot-audit/live-report-2026-10-15.md).

The benchmark-only bot improvement follow-up uses `npm run benchmark:bot-improvements`
for offline Rules traces/invariants and paired matches. Its separate frozen live pilot
uses only Jev and OpenRouter with a shared 600-attempt cap, durable no-replay ledger
and no retries/fallbacks. See [the experiment guide](benchmarks/bot-improvements/README.md).
Never reuse the exhausted original audit allocation or overwrite its evidence.

The 2026-10-15 improvement pilot completed all 600 approved Jev/OpenRouter
requests with no failures, plus 72,000 offline hand attempts with no excluded
blocks. Its authorization is exhausted. All candidates remain benchmark-only;
see [the report](benchmarks/bot-improvements/report-2026-10-15.md).

## Offline preflop action values

`npm run benchmark:preflop-action-value` compares premium opening actions with
unchanged production Rules continuations under explicit frozen/passive/aggressive
opponent policies. It uses source-frozen, credential-free workers, paired decks,
whole-block exclusions and separate equity-budget sensitivity groups. It makes no
provider calls and authorizes no production strategy promotion. Preserve completed
versioned evidence; use `benchmark:preflop-action-value:analyze` for reanalysis.
See [the guide](benchmarks/preflop-action-value/README.md).

The focused follow-up in `benchmarks/preflop-candidate/` tests medium KK and hard
QQ six-seat UTG baseline folds with benchmark-only call/3-BB overrides. All Rules
decisions use 5,000 samples. `benchmark:preflop-candidate` runs fixed/screen/frozen
selection/independent confirmation; `-- analyze` reuses evidence. Preserve exact
fallbacks, per-block checkpoints, the single-coordinator lock, disjoint seed
namespaces and preregistered stratified gates. No paid calls, replacement failures,
holdout-driven reselection or automatic production promotion are allowed.
See [the guide](benchmarks/preflop-candidate/README.md).


## Confirmed medium-KK Rules opening

Production selects `OpeningAwareEquityRulesBot` for `equity-rules-v2`; it wraps the
unchanged historical `EquityRulesV2Bot` baseline. Only medium KK baseline folds at
unopened six-seat UTG, complete empty history, all five opponents active and equal
100-BB starting stacks become exact legal 3-BB raises. Preserve the guard, exact
fallbacks and visible invariant failures. QQ remains deferred. Benchmark sources
and evidence stay historical. Frozen reanalysis requires the verified source bundle
restored into a new directory; never update old manifest hashes to match production.
See [the recovery guide](benchmarks/preflop-candidate/README.md#preserved-baseline-reanalysis).

## Completed-hand replay

Deploy `20261030000000_add_hand_replay.sql` before the replay route. The single-statement
service-role read keeps initial/final/pre-action snapshots and hand-scoped reveals
server-only. Validate sequences, actors, legality and engine snapshot equality;
legacy gaps fail closed without backfill. Immutable initial participants own names
and historical cookie identity. Only own cards appear before Result; Result uses
existing showdown/reveal visibility and authoritative per-pot awards. Explicit
strict DTOs only, private/no-store on every outcome, no providers or writes.
Replay shares the single overlay, aborts/fences lazy requests and preserves its
frame through live updates. It never pauses bots/timers/refreshes. Mobile Back to
Actions restores history position. Run `test:sql:replay`, `check`, `build` and
production replay/results/dialog/settings UI coverage. CI runs SQL replay after
game reads. See the focused documentation and localized Help.

## Independent bet-size experiment

`benchmarks/bet-sizing/` compares current, quarter-pot and 1.5-pot menus separately.
Production defaults remain current; Equity Rules is unchanged. Internal constructor
injection must agree across context, confidence wrappers, SystemOne moves/validation
and LLM schema/parsing; never expose selection through API, DTO or environment.
Run `benchmark:bet-sizing` offline; `benchmark:bet-sizing:prepare` freezes inputs
without inference. `benchmark:bet-sizing:live` requires fresh explicit authorization
for exactly 960 Jev/LLM requests beneath a shared 1,000 ceiling, with exclusive durable
reservation, one in flight, no retries/resume and entire-run first-failure stopping.
Eevo has offline compatibility only and needs no live key. Preserve every earlier
experiment's evidence and exhausted allocation. Use `benchmark:bet-sizing:analyze`
for partial report-only analysis. The frozen usage screen does not measure strength;
promotion requires separately approved paired-match evidence. See
[the experiment guide](benchmarks/bet-sizing/README.md).

The 2026-10-16 bet-size pilot completed all 960 authorized Jev/LLM requests; its
allocation is exhausted. Preserve the sanitized ledger/analysis archives, amended
freeze and original preflight-failure freeze. Only LLM quarter-pot passes the
predeclared usage screen (13/120 eligible selections; three fixtures at 3/10).
Neither Jev addition nor LLM 1.5-pot qualifies. This is usage evidence only; all
production menus remain current. Any next paid match study needs a separate plan
and explicit authorization. See the
[completed report](benchmarks/bet-sizing/live-report-2026-10-16.md).
