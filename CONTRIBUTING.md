# Contributing

This project is a small but security-sensitive demo. Contributions must follow the current code and docs, not assumptions from older notes or earlier designs.
Any change that weakens validation, privacy boundaries, migration safety, or version-checked mutation rules is not acceptable.

## Before you start

- Use Node.js 24 or newer.
- Install dependencies using `npm ci`, not a fresh lockfile drift.
- Copy `.env.example` to `.env` and fill in the required values before local testing.
- Keep Supabase migrations in order, and never edit an already-applied migration.

## Required workflow

1. Create a focused branch for the change.
2. Keep the scope narrow and reviewable.
3. Match the current architecture and project rules in the codebase.
4. Update the relevant docs when a rule, command, env var, setup step, or workflow changes.
5. Validate with the required checks before opening or updating a PR.
6. If a change affects project policy, security-sensitive behavior, or setup, include the matching doc update in the same PR.

## Required checks

Run:

```sh
npm run check
```

This includes ESLint, strict TypeScript checking, and the Vitest suite.

For routing, rendering, deployment-facing, or environment-sensitive changes, also run:

```sh
npm run build
```

See [architecture](docs/architecture.md), [gameplay behavior](docs/gameplay.md),
and [deployment prerequisites](docs/deployment.md) for detailed reference guidance.

TypeSafe policy changes should also run `npm run benchmark:policy`. This mocked,
seeded benchmark is cost-free and safe for local regression checks. Live Jev
evaluation is opt-in only via `npm run benchmark:typesafe:live`; it requires
external inference and a TypeSafe API key, performs one paid request per bot
turn, and is not part of CI. See the [benchmark guide](benchmarks/README.md)
for methodology and policy details.

## Local Supabase E2E

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

## Production smoke integration

CI runs an independent integration job alongside the unchanged
lint/typecheck/unit-test/build job on pull requests and pushes to `main`. It has a
30-minute limit and preserves cancellation of superseded commits. It uses Node
from `.nvmrc`, `npm ci`, Supabase CLI **2.119.0**, and the installed Playwright
version's Chromium (`npx playwright install --with-deps chromium` on Ubuntu).
Docker and a healthy local Supabase stack including Realtime are prerequisites.
Setup follows the official [Supabase CI guide](https://supabase.com/docs/guides/deployment/ci/testing)
and [Playwright CI guide](https://playwright.dev/docs/ci).

For local production verification, start Supabase and apply all committed
migrations, then run these commands in order:

```sh
npm run test:sql:game-reads
npm run test:sql:seats
npm run test:e2e:smoke
```

`test:e2e:smoke` builds an isolated temporary source/dependency copy that excludes
application `.env*` files. It uses the normal Turbopack production build with
`.next-e2e`, then Playwright starts `next start` on port **3002**, waits for
readiness, and never reuses an existing server. Build and startup inherit the
same validated loopback credentials from `supabase status`; credentials are
masked in Actions and logs are sanitized. External inference is forced off and
provider credentials are cleared. `E2E_BASE_URL` is rejected by the smoke runner
and by all Playwright modes in CI. No hosted credentials are needed.

Exactly five existing tests carry `@smoke`: six-seat Quick Play to a human turn;
seat claims/moves/bot assignments/releases with an unseated host; an Equity Rules
hand through history and another hand; actual two-browser Realtime for versioned
game and same-version seat changes; and polling recovery with intentionally
blocked WebSockets. Selection uses `--grep @smoke`, Chromium, one worker, and no
retries. To inspect selection without building, use
`npm run test:e2e -- --grep @smoke --list` with local Supabase running.

The CI setup script starts the full stack with health checks enabled and resets
only its disposable local database to apply committed migrations. Neither SQL
suite nor `test:e2e:smoke` resets ordinary local databases; SQL fixtures keep their
existing isolation and cleanup. Playwright tears down the application after
success or failure, the runner removes its temporary workspace, and an `always()`
workflow step stops Supabase without a backup. Local smoke leaves your already
running Supabase available.

HTML reports are generated in `playwright-report/`; failure traces/screenshots
are retained in `test-results/`. Sanitized build/application/startup logs go to
`integration-logs/`. CI uploads these paths as `integration-diagnostics` with
seven-day retention even on failure. Do not upload environment dumps, raw
Supabase status, database dumps, or production data. Browser artifacts may
contain disposable test identities. Open reports with `npx playwright show-report`
and traces with `npx playwright show-trace path/to/trace.zip`.

To validate CI failure handling, temporarily add a failing assertion to a tagged
test on a test branch, verify that the integration job fails and its artifact
contains the HTML report, screenshot, trace, and sanitized logs, then remove the
assertion and verify a green run. Keep `npm run check` and the normal
`npm run build` check. Development testing still uses `npm run test:e2e` with
`next dev`; explicit Vercel preview testing still uses `E2E_BASE_URL` outside CI.
This local production suite does **not** replace the deployed Vercel two-browser
smoke test for notification lifecycle changes. Broader coverage and branch
protection configuration are outside this job.

## Seat-mutation checks

Claims, bot assignments, and releases belong in `lib/poker/seat-service.ts` and
require typed input objects with `expectedVersion` and atomic repository methods.
Authorization uses the durable host record; a missing record never grants host
permissions. Keep database locking, idempotent retries, and moves authoritative in
the existing RPCs. Parse their returned seat rows without querying seats afterward.
Player renaming and other game lifecycle operations remain in `game-service.ts`.

With Docker and Supabase CLI available and all local migrations applied, run:

```sh
npm run test:sql:seats
npm run test:e2e -- test/e2e/lobby.spec.ts
```

The SQL suite creates isolated fixtures, uses independent PostgreSQL connections
to verify competing claims really wait on the game-row lock, and checks conflicts,
idempotent retries, atomic moves, forbidden callers, unseated/missing hosts, and
waiting versus non-waiting releases. It refuses non-local Supabase origins,
cleans up its fixtures, and never loads application `.env` or calls bot providers.
Unit tests remain independent of live Supabase. Run `check` and `build` as well.

## Game-state read checks

Apply `20261012000000_add_game_read_snapshot.sql` before deploying application
code that requires the snapshot RPC. The server-only snapshot must remain
uncached and preserve the existing public projection/privacy behavior. Standalone
reveal reads must filter both game ID and hand number and select only engine IDs.

For read-path changes, with migrated local Supabase running:

```sh
npm run test:sql:game-reads
npm run benchmark:game-reads
npm run test:e2e -- test/e2e/lobby.spec.ts test/e2e/public-lobby.spec.ts test/e2e/hand-results-actions.spec.ts test/e2e/bot-advancement.spec.ts
```

The SQL runner checks actual anonymous/authenticated denial, service-role
execution, hand filtering, and a multi-table transaction through separate
connections. Reads during an uncommitted partial update must see the earlier
state; reads across/after commit must see a coherent earlier or later state.
SQL fixtures roll back; concurrency/benchmark fixtures clean up in `finally`.
The scripts require Docker and Supabase CLI and refuse non-local HTTP origins.
They never load application `.env` or call bot providers. Browser tests start
an isolated server on port 3002. Run `check` and `build` as well.

Record request counts, body bytes, median/p95 and reveal query plans using the
[benchmark procedure](benchmarks/game-reads.md); do not add a noisy wall-clock
CI threshold. Keep the original sequential read path only in that measurement
script, never as a production fallback.

## Realtime lifecycle changes

Run `npm run check`, `npm run build`, and the focused browser tests:

```sh
npm run test:e2e -- test/e2e/realtime.spec.ts test/e2e/bot-advancement.spec.ts
```

Also run the two-browser smoke test on a Vercel deployment containing your change
(a preview, or a live site explicitly authorized for smoke testing):

```sh
E2E_BASE_URL=https://your-preview.vercel.app npm run test:e2e -- test/e2e/realtime.spec.ts
```

With `E2E_BASE_URL`, Playwright uses that deployment and skips local Supabase and
server startup; tests create private demo tables there. Record the deployment URL,
revision and result. An older live deployment does not verify changed lifecycle
behavior. See [Realtime guidance](plans/05-realtime-broadcast.md) for the contract,
rollout compatibility and reproducible before/after payload sizes.

## Translations

Translations are physically split by route and usage under `lib/i18n/dictionaries/`:

| Directory | Consumer |
|---|---|
| `metadata/<locale>.ts` | `generateMetadata` in the locale layout |
| `landing-server/<locale>.ts` | landing page Server Component prose |
| `join-game/<locale>.ts` | public-directory strings passed into its client island |
| `game/<locale>.ts` | combined lobby/table/history/feed/cards/errors dictionary |

The About route is the exception to the TypeScript dictionary layout: its long-form
content lives in `content/about/<locale>.mdx`, including a localized `metadata`
export. `lib/about/server.ts` is the server-only locale loader. Keep the heading
structure and links aligned across all ten documents when changing About copy.

There are ten locales (`en-US`, `fi-FI`, `es-ES`, `de-DE`, `sv-SE`, `fr-FR`, `pt-BR`, `it-IT`, `nl-NL`, `pl-PL`). The English module exports `as const`; every other locale uses `satisfies` with the corresponding type from `lib/i18n/types.ts`. Every dictionary module imports `server-only`.

- To add a key, add it to the English dictionary and to every other locale in the same directory; `lib/i18n/dictionaries/dictionaries.test.ts` compares leaf-key paths and placeholders against English.
- To add a locale, add `<locale>.ts` to each dictionary directory, register it in `SUPPORTED_LOCALES` in `lib/i18n/index.ts`, and add its dynamic import entry to the matching map in `lib/i18n/server.ts`.
- Server Components load dictionaries directly through the loaders in `lib/i18n/server` (`getMetadataDictionary`, `getLandingServerDictionary`, `getGameDictionary`).
- The landing page is cached server output: `LanguageMenu` uses locale links and the new-game control is a plain POST form. Keep request cookies and game creation in `app/[lang]/new-game/route.ts`, outside the cached page.
- Keep the landing-page **Join game** control a plain server-rendered anchor.
  Keep the directory heading and navigation in the server-rendered shell and
  stream its initial data through a Suspense-wrapped request-time Server
  Component; only its form, polling, pagination, and navigation are client code.
  Cache only visitor-independent candidate pages. Player-token host/seated
  exclusions must remain request-specific, and directory mutations must
  invalidate the shared candidate cache.
- Client game components receive the game route's `I18nProvider`, which serves the combined game dictionary from `app/[lang]/game/[gameId]/layout.tsx`.
- Waiting-lobby onboarding is derived in the pure view-model helper from
  authoritative seats, viewer ownership, host permissions, and the current
  settings validity. Keep the invite URL limited to the current origin and
  localized game pathname; never copy query parameters, fragments, player
  tokens, or other credentials.
- Never import dictionary values from client components or shared client utilities (such as `components/poker/view-model.ts`); pass the needed strings explicitly.
- Long-form About content stays in MDX and is rendered directly by its Server Component route; do not register it in the game dictionary or any shared provider.
- A future shared interactive component receives its own narrow strings through props.

The landing and About pages use a server-only language menu with a native
`<dialog popover="auto">`. Outside clicks and Escape dismiss it; ordinary locale
links navigate to a new document. CSS anchor positioning places it below the
trigger with a centered fallback. Browsers without popover support show the links
inline. Landing-page Quick Play and custom-table creation use plain HTML forms
and work without JavaScript.

## Documentation standards

Docs are part of the implementation.

- Keep [AGENTS.md](AGENTS.md), [README.md](README.md), and this file aligned with the live codebase.
- When a repo rule, setup step, env variable, command, or workflow changes, update the relevant docs in the same change.
- Do not leave stale instructions behind; stale guidance is a product bug.

## Architecture and security rules

- Keep third-party poker-engine details behind `lib/poker/adapter.ts`.
- Let the authoritative engine decide legality; validate proposed human actions before persisting them.
- Preserve optimistic-concurrency checks and expected version validation in the service and API layers.
- Keep secrets server-only. Do not add `NEXT_PUBLIC_` prefixes or import server code into client components.
- Do not expose private hole cards, player tokens, raw TypeSafe inputs, or private responses in public DTOs.
- Derive elimination and table victory from public authoritative state. Unresolved
  all-ins can recover. Share next-hand eligibility across UI controls and shortcuts,
  preserve manual watching and card revealing, and keep fresh Quick Play isolated
  from the old table. The localized quick-game endpoint supports JSON replay and
  form redirects with the same identity cookies and server-selected bots.
- Only hosts and owned seated human players may advance bots, including folded or
  eliminated seated humans and unseated bot-only hosts. Spectators only refetch.
  Check ownership before provider resolution or inference; unauthorized steps return
  403. One browser runs one bot loop; authorized browsers can still race and incur
  duplicate inference, but only one version-checked action commits. Conflicts stop
  the stale loop and refresh silently; refresh and provider failures stay visible.
  Stop at human turns, completed hands, navigation, or lost eligibility. Next hands
  require explicit interaction; bots pause without an eligible open browser.
- Keep database mutations atomic and scoped to at most one action per request.
- Public listings are private by default. Preserve the two-minute database-time
  host lease, 30-second visible-host heartbeat, and server-role-only access.
  Seat claims, moves, bot assignments, releases, start, and settings changes
  must retain the shared game lock and expected-version ordering.

## Pull requests

- Keep PRs small, focused, and easy to review.
- Include tests for behavior changes and bug fixes, especially for stale, illegal, unauthorized, or privacy-sensitive paths.
- Call out migrations, env changes, or deployment implications explicitly in the PR description.
- State which verification commands you ran and their result.
- If the change affects docs, include the doc update in the same PR.

## Questions

If a project rule or workflow is unclear, prefer the current code and project docs over older notes, assumptions, or stale examples.

## Bot decision scenarios

Run `npm run test:bots` for reproducible engine-backed legality and obvious-blunder
checks against Equity Rules. Each bot/model has a separate test group. LLMs
include every supported playstyle (`balanced`, `tight`, `aggressive`) as nested
groups. Filter a profile with `-t 'my-llm.*tight'`, or select an entire bot with
`npm run test:bots -- -t 'equity-rules-v2'`. The same fixtures
support opt-in live TypeSafe and configured LLM bots. See [scenario instructions](benchmarks/scenarios/README.md)
for commands, costs, extending fixtures, and known failures. This evaluation
returns nonzero for current bot weaknesses; fixture/grader tests run in ordinary
`npm run check` without external services.

Vitest automatically loads the optional root `.env.test` file for unit tests and
benchmarks before collecting tests. Existing shell/CI variables take precedence;
`.env` is not loaded. `.env.test` is ignored by Git and can hold local provider
credentials. Live bot evaluations still require their explicit opt-in flags.

## SEO metadata

Keep localized search titles and descriptions in the server-only `metadata`
dictionaries. `lib/seo.ts` builds page-specific canonicals, language alternates,
and social cards; About metadata comes from its localized MDX document.
The sitemap includes only durable public content. Keep game tables and the
visitor-specific directory marked `noindex, follow`. The canonical origin defaults
to `https://www.aiholdem.gg`; set `NEXT_PUBLIC_APP_URL` before building to override it; see [deployment guidance](docs/deployment.md#search-and-social-previews)
for origin fallbacks and social image replacement.

## Agent and search discovery

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

## HTTP contracts

Every application-owned JSON endpoint has a browser-safe Zod contract in
`lib/http/*-contracts.ts` and a named method in `lib/http/api.ts`. Common game
identifiers, versions, errors and immutable aliases live in `common-contracts.ts`;
explicit public DTO schemas live in `schemas.ts`. Infer HTTP request, response,
and UI projection types from these schemas; retain distinct engine and persistence
models. Schemas do not authorize viewers: ownership-aware services still control
private cards and tokens.

Use named client methods without response type arguments. The shared transport
serializes bodies and queries, validates every successful response, forwards abort
signals and same-origin credentials, and uses `no-store` for authoritative reads.
It never retries mutations or batches requests. First-party browser UI must not
call `fetch` directly; ESLint enforces the transport boundary. Routes validate
shared input schemas, preserve domain validation messages and defaults, and type
outgoing envelopes with `satisfies`. Test actual route responses against their
schemas. Do not runtime-parse mutation responses after committing: a projection
failure must not misreport a committed mutation as a failure.

The endpoint-to-contract/client checklist is complete:

| Endpoint | Request contract (path/query/body) | Response schema | Named method (`api.` prefix) |
| --- | --- | --- | --- |
| `GET /api/games/:gameId` | `gameParamsSchema` | `getGameResponseSchema` | `games.get` |
| `POST /api/games/:gameId/action` | game params / `submitActionRequestSchema` | `submitActionResponseSchema` | `games.submitAction` |
| `POST /api/games/:gameId/step` | game params / `stepBotRequestSchema` | `stepBotResponseSchema` | `games.stepBot` |
| `POST /api/games/:gameId/start` | game params / `startRequestSchema` | `lifecycleResponseSchema` | `games.start` |
| `POST /api/games/:gameId/next-hand` | game params / `nextHandRequestSchema` | `lifecycleResponseSchema` | `games.nextHand` |
| `POST /api/games/:gameId/reveal` | game params / `revealRequestSchema` | `lifecycleResponseSchema` | `games.reveal` |
| `PATCH /api/games/:gameId/settings` | game params / `settingsRequestSchema`, `tableSettingsSchema` | `lifecycleResponseSchema` | `games.settings` |
| `PATCH /api/games/:gameId/seat-count` | game params / `seatCountRequestSchema` | `lifecycleResponseSchema` | `games.seatCount` |
| `POST /api/games/:gameId/seats/:seat/claim` | `seatPathParamsSchema` / `claimSeatRouteRequestSchema` | `seatResponseSchema` | `seats.claim` |
| `POST /api/games/:gameId/seats/:seat/release` | seat params / `releaseSeatRequestSchema` | `seatResponseSchema` | `seats.release` |
| `PATCH /api/games/:gameId/seats/:seat/name` | seat params / `renameSeatRequestSchema` | `seatResponseSchema` | `seats.rename` |
| `POST /api/games/:gameId/seats/:seat/assign-bot` | seat params / `assignBotRequestSchema` | `seatResponseSchema` | `seats.assignBot` |
| `POST /api/games` | `createGameRouteRequestSchema` | `createGameResponseSchema` | `creation.custom` |
| `POST /:lang/quick-game` (JSON) | `quickPlayParamsSchema` | `quickPlayResponseSchema` | `creation.quickPlay` |
| `GET /api/bots` | no parameters | `botCatalogResponseSchema` | `bots.catalog` |
| `GET /api/games/:gameId/history?hand=N` | game params / `historyRouteQuerySchema` | `historyResponseSchema` | `games.history` |
| `GET /api/games/:gameId/feed?sinceHand=N` | game params / `feedRouteQuerySchema` | `feedResponseSchema` | `games.feed` |
| `GET /api/games/public?cursor=...` | `directoryRouteQuerySchema`, `directoryCursorSchema` | `directoryResponseSchema` | `discovery.list` |
| `POST /api/games/:gameId/join` | game params / `joinRequestSchema` | `joinResponseSchema` | `discovery.join` |
| `PATCH /api/games/:gameId/publication` | game params / `publicationRequestSchema`, `listingTitleSchema` | `publicationResponseSchema` | `discovery.publication` |
| `POST /api/games/:gameId/heartbeat` | game params (no body/version) | `heartbeatResponseSchema` | `discovery.heartbeat` |

Gameplay and lifecycle contracts live in `gameplay-contracts.ts`; seats,
creation/catalog, history/feed, and discovery/publication have separate feature
files. Wire query schemas preserve first-value history/cursor parsing and reject
repeated `sinceHand`, nondecimal feed cursors, and values above PostgreSQL's
2,147,483,647 integer limit. Client query schemas accept typed numbers. Creation
and claim wire schemas retain historical optional-name normalization. Unknown
wire fields are stripped as before; typed method object literals reject unexpected
fields at compile time. Rename and heartbeat do not require versions. Heartbeat
renewal is best-effort, catches failures, and keeps its visibility/online checks
and 30-second schedule without incrementing the game version.

`HttpError` retains status and optional code. Only `GAME_VERSION_CONFLICT`
triggers the bot loop's silent refresh. Preserve `GAME_CONFLICT`,
`GAME_UNAVAILABLE`, and `LISTING_NOT_RENEWABLE`; an arbitrary 409 is not a
stale-version signal. Failed joins still refresh the directory and select the
existing messages. Preserve request sequencing, feed synchronization, privacy
projections, directory-cache invalidation and scheduled Realtime notifications.

Non-JSON exceptions are HTML forms (`/:lang/new-game` and normal
`/:lang/quick-game` submissions), their 303 redirects and identity cookies,
Realtime envelopes, static discovery/metadata content, and external provider
clients. Quick Play's named JSON method sends `Accept: application/json`; it
does not change form behavior.

Contract verification includes compile-time negative inputs and inferred outputs,
shared transport serialization/cancellation/error tests, and actual route response
checks for every JSON endpoint. Run `npm run check`, `npm run build`, and local
Playwright lobby, end-game, betting, bot-advancement, hand-results/actions and
public-lobby suites after changes to these flows.
