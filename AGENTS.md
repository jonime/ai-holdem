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
An independent 30-minute integration job uses Docker, pinned Supabase CLI 2.119.0,
and the installed Playwright Chromium with system dependencies. It starts a
healthy full local stack (including Realtime), applies every migration to its
disposable database, then runs `test:sql:game-reads`, `test:sql:seats`, and
`test:e2e:smoke` in order. Startup/migration errors fail the job; never ignore
health checks. Preserve workflow cancellation for superseded commits.

Local production smoke requires an already-running migrated local Supabase and
Chromium (`npx playwright install chromium`). `npm run test:e2e:smoke` builds an
isolated copy without application `.env*`, uses `.next-e2e` and port 3002, and
starts `next start` with identical local build/server environment values. Never
reuse a server or read hosted credentials. Validate loopback status origins,
mask credentials, disable external inference, and clear provider credentials.
Reject `E2E_BASE_URL` in CI; keep development and explicit preview modes outside
CI. The five reused `@smoke` tests cover Quick Play, unseated host seat authority,
Equity Rules completion/history/next hand, real two-browser Realtime game/seat
events, and intentionally blocked WebSocket polling recovery. Use Chromium with
one worker and no retries. Ordinary local smoke/SQL commands never reset the DB.

Keep failure traces/screenshots, HTML reports, and sanitized application/startup
logs in `test-results/`, `playwright-report/`, and `integration-logs/`; upload CI
diagnostics for seven days. Never upload status/environment dumps, service-role
keys, database contents, or production data. Always tear down the application
and CI Supabase even after failures; local smoke preserves the running stack.
See `CONTRIBUTING.md` for prerequisites, selection and artifact inspection. This
integration job does not replace the Vercel two-browser lifecycle smoke test.

## Architecture Rules

- Keep third-party poker-engine details behind `lib/poker/adapter.ts`. Inspect
	the installed package declarations and behavior before using an engine API.
- The poker engine, never TypeSafe output or client input, decides legality.
	Validate a proposed action, apply it through the adapter, then persist it.
- Only hosts and owned seated human players may advance bots, including folded or
  eliminated seated humans and unseated bot-only hosts. Spectators only refetch.
  Check ownership before provider resolution or inference; unauthorized steps return
  403. One browser runs one bot loop; authorized browsers can still race and incur
  duplicate inference, but only one version-checked action commits. Conflicts stop
  the stale loop and refresh silently; refresh and provider failures stay visible.
  Provider requests share a server-only 60-second deadline covering headers and body.
  Temporary failures return allowlisted BOT_* codes with HTTP 502 and pause the
  failed hand/actor turn, including across polling/version-only refreshes. Retry
  explicitly refetches authoritative state and prevents parallel loops; no retries
  or fallback actions run automatically. The bot-step route requests 90 seconds
  on Vercel; verify the deployed effective duration before release.
  Stop at human turns, completed hands, navigation, or lost eligibility. Next hands
  require explicit interaction; bots pause without an eligible open browser.
- Confirmed LLM credit failures apply one engine-validated fold and mark the seat
  leaving atomically through `apply_ai_action_and_leave_if_version`; next-hand
  reconciliation removes it. Apply `20261014000000_add_atomic_bot_credit_departure.sql`
  before deploying the code. OpenRouter temporary in-flight spending holds and
  rate limits remain paused, as do undocumented Jev credit failures. Preserve
  safe structured LLM/Jev HTTP logs and the localized credit-departure notice;
  never log raw provider messages, inputs, responses, headers, keys or cards.
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
- Keep `SUPABASE_SECRET_KEY` and `TYPESAFE_API_KEY` server-only. Never add a
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
- Unprefixed HTML URLs use a temporary browser-language redirect with English
  fallback; explicit locale URLs win. Keep these redirects private/no-store for
  browsers and CDNs and vary by Accept and Accept-Language. Locale-prefixed page
  caching and Markdown content negotiation remain independent.
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

## Code Map

- `docs/`: gameplay, architecture, and deployment reference guides linked from
  the README. `benchmarks/README.md` indexes evaluations and policy benchmarks.
- `app/api/games/`: HTTP boundary for game creation, actions, seats, history,
	AI stepping, and hand transitions.
- `lib/poker/`: domain types, engine adapter, public projections, and game
	orchestration. `seat-service.ts` owns atomic claim, bot assignment, and release;
  `seat-contracts.ts` and `host-authorization.ts` hold dependency-neutral contracts
  and durable host authorization. Seat mutations require an expected version and
  parse the RPC-returned seat without a follow-up seat query.
- `lib/supabase/`: persistence parsing and repository implementation.
- `lib/typesafe/`: System One HTTP client and constrained decision validation.
- `lib/http/*-contracts.ts` and `lib/http/api.ts`: feature-specific, browser-safe inferred contracts and runtime-validated named methods for every application-owned JSON endpoint. Browser UI uses this transport boundary; HTML forms/redirects, Realtime and external provider clients remain separate. See the endpoint checklist in `CONTRIBUTING.md`.
- `lib/realtime/`: server publishing and client refetch subscriptions.
- `lib/i18n/`: locale helpers, server-only dictionary loaders, and per-locale
	dictionaries split by route group (`metadata`, `landing-server`,
	`join-game`, `game`) under `lib/i18n/dictionaries/`.
- `content/about/`: localized MDX for the server-only About route; every locale
	exports its own title and description metadata and follows the same heading
	structure.
- `components/poker/`: client game, lobby, and spectator experience.
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

Vitest automatically loads the optional root `.env.test` file for unit tests and
benchmarks before collecting tests. Existing shell/CI variables take precedence;
`.env` is not loaded. `.env.test` is ignored by Git and can hold local provider
credentials. Live bot evaluations still require their explicit opt-in flags.

## Shared Jev/LLM context and evaluations

Use `get_bot_hand_context` for inference history, never the inspection history RPC.
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
