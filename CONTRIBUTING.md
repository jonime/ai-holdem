# Contributing

This project is a security-sensitive browser poker game. Contributions must follow the current code and docs, not assumptions from older notes or earlier designs.
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

## Deterministic poker simulations

`npm run check` includes `test/poker-simulation/`: five fixed seeds (1–5) for
each seat count 2–6, for 25 games with at most ten hands each, plus harness
checks and explicit fixtures. The simulation imports the production adapter,
`restorePersistedState`, and `publicProjectionForViewer`; it is separate from the
bot-strategy benchmark harness and uses no database, browser, or provider calls.
Only synthetic identities and ownership tokens enter its diagnostics.

Run the larger offline matrix or reproduce one generated case:

```sh
npm run test:poker:simulation
npm run test:poker:simulation -- --seed 7 --seats 3 --hands 10
```

The dedicated command defaults to seeds 1–50 across seats 2–6 (250 games), with
at most 40 hands per game. Overrides select an unsigned 32-bit `--seed`
(0–4294967295), `--seats` (2–6), or `--hands` (1–40). Missing, duplicate,
noninteger, out-of-range, and unknown arguments fail. Selection/filter arguments
are rejected and empty selections fail. The five named fixtures always run,
including when reproducing one generated case. Normal Vitest/check never reads
simulation environment overrides; the dedicated config alone receives the
runner's validated arguments. It does not load `.env` or `.env.test`.

The generator uses Mulberry32 with uint32 arithmetic and descending Fisher–Yates
shuffling of the adapter's canonical complete deck. FNV-1a derives separate
stack, deck, and action streams from the seed, seat count, hand number, and
purpose. Case order and intervening runs cannot change decks or action traces.
Stacks are integer chips with blinds 5/10: one deliberately short seat starts
with 1–9 chips, and other seats start with 10–1000 chips. Human and synthetic
rules-bot configurations alternate; no bot implementation is invoked.

The action generator selects adapter-reported folds, checks, calls, and
minimum/midpoint/maximum legal bet or raise targets, expressed as integer
**total-street targets**. After 64 actions it switches deterministically to
check/call, recording `passive-after-64` in the trace. This is the generation
policy, not recovery from a failed action. A hand still active after 128 actions
fails. Games stop normally when fewer than two funded seats remain or the hand
limit is reached; producing a table winner is not required.

Every transition checks chip conservation (active stacks plus commitments;
settled stacks alone), nonnegative safe integers, decision progress, settlement,
personal net changes, and public stacks/awards against raw engine accounting
facts. Only `adapter-facts.ts` inspects engine structure. A second branch JSON
round-trips and restores before/after each transition, using exactly the same
preselected deck/actions. State, legal actions, snapshots, hand baselines,
outcomes, and every viewer projection must agree. All human owners, a spectator,
and an unknown token are checked for private cards, categories, results, and
ownership tokens. Completed showdown and explicit-reveal views are checked
separately, and projection must neither mutate state nor affect another viewer.
Fixtures guarantee short all-ins/side pots, uncalled refunds, odd-chip splits,
consecutive hands, and activation of the 64-action policy.

Failures include the synthetic configuration, seed, hand/action index, ordered
actions with policy labels, the underlying assertion, and a reproduction command.
To preserve a discovered failure, first reproduce that command, then reduce its
synthetic stacks, deterministic deck prefix, and ordered actions into a named
fixture or a focused adapter/projection test beside the owning module. Assert the
specific broken invariant and retain the failing seed/trace as context. Do not
weaken accounting/privacy assertions or fix production behavior in a test-only
change. This suite exercises integration consistency with the installed engine;
it is neither an independent proof of poker rules nor a strength evaluation.
SQL concurrency/authorization/departures and browser lifecycles remain covered by
their existing suites.

Runtime measurements are descriptive, not pass/fail thresholds; no retries or
timing assertions are added. On Node 24.21.0, the default simulation/harness
files took 0.93 seconds in isolation (the incremental simulation workload); the
extended matrix and fixtures took 7–9 seconds. The successful full check had a
40.60-second Vitest phase (1,618 tests), versus 41.32 seconds with these two files
excluded (1,583 tests). Total-suite differences were within local timing noise;
the isolated workload is the useful overhead estimate.

## Database contracts

Use Node 24+, Docker, and Supabase CLI **2.120.0** on `PATH`. Start the local
stack and apply every committed migration in filename order using the existing
local migration workflow. After a schema change:

```sh
npm run db:types:generate
npm run db:types:check
npm run check
```

Commit `lib/supabase/database.generated.ts` exactly as generated. The commands
check the CLI version and applied local migration versions, then generate only
the local `public` schema. They never load application environment files, pass
hosted credentials, reset databases, or apply migrations. Generation replaces
the file atomically after success; checking compares temporary output and never
changes the committed file. Missing CLI/Docker/local stack, unapplied migrations,
and stale types fail the command. Install the pinned CLI before retrying; the
commands do not install it automatically.

Keep SQL nullability and structured JSON refinements in the server-only
`lib/supabase/contracts.ts`, separate from HTTP DTOs. Generated signatures check
RPC names/arguments and table writes/filters; JSON contracts bind timer operations,
creation metadata/players and departure folds. Continue runtime validation of
responses and poker state. `contracts.typecheck.ts` uses `@ts-expect-error` cases
so accepting an invalid call fails the ordinary Docker-free typecheck. Tooling
and repository tests also preserve malformed-response coverage.

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

## External bot application integration

With Node 24+, Docker, Supabase CLI 2.120.0, and an already-running healthy
local Supabase with **every committed migration applied**, run:

```sh
npm run test:integration:bot-pipeline
```

The launcher validates the local status origin before creating clients and starts
a separate Vitest process with an allowlisted environment. Neither `.env` nor
`.env.test` is loaded; inherited provider credentials and `NODE_OPTIONS` are
excluded. A random test-only usage secret and synthetic LLM catalog enable
external seat selection only in that process. Network guards reject non-loopback
fetch/TCP/HTTP(S) destinations and redirects. No provider registry is instantiated,
provider endpoint is added, or production bypass is enabled.

The suite injects deterministic decisions through `BotRegistry` into
`stepBotAction`. Quick Play retains the real catalog descriptors and configuration
metadata; two-seat custom tables use production creation, assignment and start
services. TypeSafe, Eevo and LLM coverage follows real persisted hand/session parsing,
authorization, claim acquisition, allowance admission, engine validation and
atomic action persistence. Human turns use the action service, and the next hand
starts explicitly. Each step checks version/action counts, consumed claims,
owner/game charges, privacy and authoritative response fields. Read-only host
publication metadata is separate from action responses; each response's server
timestamp is validated independently of committed-state equality.

Promise barriers with deadlines exercise competing repository clients. Rejected
ownership/stale versions, illegal decisions, simulated provider failures with
explicit retries, and exhausted fixture counters check unchanged state, charges
and claim cleanup. Tests report scenario names and safe invariant labels without
assertion diffs, contexts, credentials or database dumps. They test pipeline
correctness, **not provider HTTP behavior, provider availability, playing
strength, or deployed Vercel response lifecycles**. Unit tests cover environment
rejection, network guards, bounded barriers and cleanup error handling.

Each fixture has a unique owner. Suite teardown discovers its games by that owner,
including a creation that committed before response parsing failed, deletes only
fixture histories/reveals/games, and removes its creation-attempt and allowance
rows. Game dependents (including claims) and fixture allowances are checked for
absence after cleanup. A simulated harness-failure scenario also verifies cleanup
and repeat cleanup. The random hashing secret isolates IP allowance records from
other runs. The command never resets or migrates the database. Hard process kills
can prevent teardown; do not interrupt a running suite if cleanup is required.

CI runs this command after SQL checks and before browser tests against the same
migrated disposable stack. Browser inference remains disabled, and unconditional
Supabase teardown is retained. The dedicated Vitest configuration is excluded
from ordinary unit tests and bot benchmarks. A failing production invariant must
remain a failing case and be reported, rather than weakened or fixed as an
unannounced expansion of this test-only work.

Bot action responses and authoritative snapshots guarantee ascending numeric
seat order. `getSeatAssignments` validates rows before sorting the parsed
assignments; snapshot RPC validation still rejects malformed or unordered results.
The host-seat-move regression assigns the host to seat 1 and the external bot to
seat 0, then strictly compares the response with the snapshot without normalizing
either array. The comparison is deferred to scenario teardown so full lifecycle
checks and cleanup still complete.

## Production browser integration

CI runs an independent integration job alongside the unchanged
lint/typecheck/unit-test/build job on pull requests and pushes to `main`. It has a
30-minute limit and preserves cancellation of superseded commits. It uses Node
from `.nvmrc`, `npm ci`, Supabase CLI **2.120.0**, and the installed Playwright
version's Chromium and WebKit (`npx playwright install --with-deps chromium webkit` on Ubuntu;
`npx playwright install chromium webkit` on macOS).
Docker and a healthy local Supabase stack including Realtime are prerequisites.
CI's `scripts/e2e/ci-setup.mjs` installs browsers/system dependencies alongside
Supabase startup and migration application. Both tasks must finish successfully
before schema or test checks begin; failures wait for both children to exit before
the workflow's unconditional Supabase teardown. Each task retains its deadline
and sanitized logs in `integration-logs/`.
Setup follows the official [Supabase CI guide](https://supabase.com/docs/guides/deployment/ci/testing)
and [Playwright CI guide](https://playwright.dev/docs/ci).

CI pulls Supabase registry images normally during startup. Docker image archive
caching was removed after a measured cache hit spent about 30 seconds restoring
a 1.66 GiB archive and 96 seconds loading it, while avoiding only about 47 seconds
of startup work. See the [cached run](https://github.com/jonime/ai-holdem/actions/runs/37427550384)
and [earlier uncached run](https://github.com/jonime/ai-holdem/actions/runs/37422679102).
The npm download cache remains enabled. Every run starts a fresh disposable
stack, applies all migrations, checks health, and runs `db:types:check` before SQL tests; containers, volumes, and
database state are never cached.

For local production verification, start Supabase and apply all committed
migrations, then run these commands in order:

```sh
npm run db:types:check
npm run test:sql:game-reads
npm run test:sql:replay
npm run test:sql:creation
npm run test:sql:my-games
npm run test:sql:removal
npm run test:sql:bot-context
npm run test:sql:seats
npm run test:sql:departures
npm run test:sql:turn-timers
npm run test:sql:bot-claims
npm run test:sql:usage
npm run test:e2e:ci
```

All four production commands share one runner. `test:e2e:smoke` selects `@smoke`
and `test:e2e:ui` selects `@ui-regression`, both Chromium-only by default.
`test:e2e:webkit` selects `@compatibility` in `webkit-desktop` (Desktop Safari)
and `webkit-mobile` (iPhone 13), using the installed Playwright device profiles.
WebKit projects only collect compatibility-tagged tests. `test:e2e:ci` explicitly
selects Chromium smoke/UI coverage and both focused WebKit projects, building
once and running one Playwright invocation with one combined HTML report. The UI
suite includes tests in `dialogs.spec.ts`, `betting-controls.spec.ts`,
`hand-results-actions.spec.ts`, `request-recovery.spec.ts`, `table-loading.spec.ts`,
and `turn-notifications.spec.ts`, preserving
desktop/mobile, focus/keyboard, betting validation, hand results, Actions feed,
and stalled-request recovery coverage. CI runs the combined
command after all SQL checks. Production UI setup seeds only its own waiting
local tables through the service-role creation RPC, gives each host a fresh
browser identity, and deletes those fixtures after each test. Starting hands,
joining, betting, revealing, and next-hand mutations still use the application.
This keeps UI setup from exhausting the shared local IP creation allowance;
creation/fair-use smoke tests continue through the real creation routes with
all protections enabled. Development/explicit preview UI setup keeps using
normal creation routes.

Every browser case uses `test/e2e/fixtures.ts`. In isolated local production
runs, its automatic fixture clears only the runner's HMAC-scoped creation IP
bucket before and after each case, including failures. Owner counters and all
within-case limits remain active, so the creation-denial smoke still exercises
real admission. This requires one worker and the runner's fresh hash secret;
it never clears other usage rows or runs against development/preview servers.
Use the shared fixture's `test` export for new browser cases. Realtime observers
share `realtime-observer.ts`, which decodes both JSON and SDK binary broadcasts
from the browser's actual socket.

The focused compatibility suite covers these cases per WebKit project: real rules-only
Quick Play to an actionable human turn; input edits, presets and a legal raise;
Help/Settings scrolling, background scroll locks and restored focus (desktop
Escape/mobile touch dismissal); disabled shortcuts with native focused controls
and reload persistence; language changes preserving ownership and unprefixed
English; card palettes across table, results, Actions and Help; and a committed mutation with a lost response and no automatic replay.
Mobile automation uses touch taps for controls and dismissal and checks scroll
containers; physical swipes and the on-screen keyboard remain device checks.
UI cases reuse isolated fixtures; fair-use protections remain enabled. Chromium
keeps its existing cases; the new focused-only file is excluded there. Keep one
worker, zero retries and existing timeouts; record combined execution duration
before release rather than hiding failures with skips or retries.

Playwright WebKit is neither branded Safari nor a physical iPhone. Automated
passes establish focused engine/emulation coverage, not complete Safari
certification. See [Playwright browser documentation](https://playwright.dev/docs/browsers).
Firefox, a full device matrix, paid device services and visual redesign are outside
this coverage.

Each command builds an isolated temporary source/dependency copy that excludes
application `.env*` files. It uses the normal Turbopack production build with
`.next-e2e`, then Playwright starts `next start` on port **3002**, waits for
readiness, and never reuses an existing server. Build and startup inherit the
same validated loopback credentials from `supabase status`; credentials are
masked in Actions and logs are sanitized. External inference is forced off and
provider credentials are cleared. `E2E_BASE_URL` is rejected by the production runner
and by all Playwright modes in CI. No hosted credentials are needed.

The `@smoke` suites cover Play navigation, browser identity isolation, personal/public failures, retries, pagination, redirects, mobile and keyboard behavior, public joining, plus four fair-use tests (both countdown codes, rules-only replay/navigation, and shared HTML/JSON creation denials) and these five lifecycle tests: six-seat Quick Play to a human turn;
seat claims/moves/bot assignments/releases with an unseated host; an Equity Rules
hand through the Actions feed and another hand; actual two-browser Realtime for versioned
game and same-version seat changes; and polling recovery with intentionally
blocked WebSockets. Selection uses `--grep @smoke`, Chromium, one worker, and no
retries. To inspect selection without building, use
these commands with local Supabase running (no production build):

```sh
npm run test:e2e -- --project=chromium --grep @smoke --list
npm run test:e2e -- --project=chromium --grep @ui-regression --list
npm run test:e2e -- --project=chromium --project=webkit-desktop --project=webkit-mobile --grep '@smoke|@ui-regression|@compatibility' --list
```

The production commands also accept `--list` (after their isolated build).
Local smoke/UI commands accept file filters and explicit `--grep` overrides;
file filters intersect the default tag, while explicit grep replaces it. An
empty grep selects every test in the supplied files:

```sh
npm run test:e2e:smoke -- test/e2e/realtime.spec.ts
npm run test:e2e:ui -- test/e2e/storage-preferences.spec.ts
npm run test:e2e:ui -- test/e2e/dialogs.spec.ts
npm run test:e2e:ui -- test/e2e/betting-controls.spec.ts --grep ''
```

The combined command accepts only `--list`; other arguments are rejected before
building so filters, sharding, alternative configs, or last-failed selection
cannot silently omit any required project or suite. Empty selections fail in all four commands;
`--pass-with-no-tests` is forbidden.

The CI setup script starts the full stack with health checks enabled and resets
only its disposable local database to apply committed migrations. Neither SQL
suite nor any production browser command resets ordinary local databases; SQL fixtures keep their
existing isolation and cleanup. Playwright tears down the application after
success or failure, the runner removes its temporary workspace, and an `always()`
workflow step stops Supabase without a backup. Local production verification leaves your already
running Supabase available.

HTML reports are generated in `playwright-report/`; failure traces/screenshots
are retained in `test-results/`. Explicit screenshots use project-qualified
`test.info().outputPath()` paths so projects cannot overwrite each other. Sanitized build/application/startup logs go to
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

### Game route fallback verification

Page unit tests distinguish malformed IDs, absent tables, successful reads and
repository errors. Component tests cover all game dictionaries, Lobby paths and
error-detail privacy. The production UI suite includes `storage-preferences.spec.ts` for pre-initialization
storage-object/read/write failures, desktop/mobile Actions controls, name drafts,
reload persistence and hydration errors. It also includes `table-loading.spec.ts`:
English/Finnish server-read and initial-browser-read delays on fresh URLs,
desktop/mobile neutral loaders with branding, accessible localized status, reduced
motion and no felt, seats, gameplay controls or Actions skeleton. Direct visits
and client navigation transition into waiting/active/completed views, respecting
desktop Actions defaults and saved preferences while keeping the mobile modal
closed. When changing these boundaries, also refresh valid and missing game URLs
in `next dev` for English and a prefixed locale and check browser/server logs for
uncached-data diagnostics; production builds do not run this development-only
instant-navigation validation. Keep the game-ID `loading.tsx` boundaries as well
as the shared parent boundary. Frame samples guard against an intermediate
full-width table; delayed subsequent reads retain the current screen.
It also covers missing and malformed links, keyboard Lobby navigation, mobile
layout and noindex, plus keyboard retry through repeated render failures into a
successful table with URL and identity preserved.

The production runner instruments only its disposable source copy with
`scripts/e2e/table-read-fault.mjs`. Tests control per-table failure and bounded delay file markers in that
copy; the checkout and normal production build contain no fault endpoint or
runtime flag. Screenshot artifacts are in each project-qualified test directory under `test-results/`.
Inspect an authorized production preview for early shell delivery as well; local
streaming verification does not prove deployment buffering behavior.
Route-render retry refetches the segment and never replays gameplay actions;
existing in-game unknown-outcome recovery and removed-table handling are tested
separately.

### Physical iPhone Safari verification

Use an explicitly authorized preview with external inference disabled. Record
device model, iOS version, Safari version, deployment URL/revision, verification
date and pass/fail notes for each item:

- Start and play a hand; edit betting inputs with the on-screen keyboard.
- Open, scroll and dismiss Help and Settings in portrait and landscape.
- Enable sound through a gesture; confirm the preview and a subsequent turn cue.
- Background and resume the tab; confirm usable recovery. Background sound is
  best-effort and is not required to be guaranteed.
- Switch Classic/Four-colour, check table/results/Actions/Help suit symbols and colours,
  reload to check persistence, and return to Classic.
- Reload and switch language; confirm settings and owned seat persist, then
  return to unprefixed English.

Physical-device verification is **outstanding** for this change until a recorded
real-device run is available. An emulated iPhone pass does not complete it.

## Seat-mutation checks

Claims, bot assignments, and releases belong in `lib/poker/seat-service.ts` and
require typed input objects with `expectedVersion` and atomic repository methods.
Authorization uses the durable host record; a missing record never grants host
permissions. Keep database locking, idempotent retries, and moves authoritative in
the existing RPCs. Parse their returned seat rows without querying seats afterward.
Player renaming and other game lifecycle operations remain in `game-service.ts`.
Bot execution belongs in `bot-turn-service.ts`; production callers use the
claim-protected `stepBotAction`, while `stepTypesafeAction` is only a legacy test
seam. Both services use the shared driver authorization, persisted-state,
projection/reveal/timer helpers and repository contracts described in
[service boundaries](docs/architecture.md#poker-service-boundaries), and neither
service imports the other.

With Docker and Supabase CLI available and all local migrations applied, run:

```sh
npm run test:sql:seats
npm run test:sql:departures
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
server startup; tests create private test tables there. Record the deployment URL,
revision and result. An older live deployment does not verify changed lifecycle
behavior. See [Realtime guidance](plans/05-realtime-broadcast.md) for the contract,
rollout compatibility and reproducible before/after payload sizes.

## Translations

Translations are physically split by route and usage under `lib/i18n/dictionaries/`:

| Directory | Consumer |
|---|---|
| `metadata/<locale>.ts` | `generateMetadata` in the locale layout |
| `landing-server/<locale>.ts` | landing page Server Component prose |
| `play/<locale>.ts` | Play headings, statuses, personal table strings passed into client islands |
| `join-game/<locale>.ts` | reusable public-directory strings passed into the Play client island |
| `game/<locale>.ts` | combined lobby/table/feed/cards/errors dictionary |

About and in-game Help use MDX for long-form content instead of TypeScript dictionaries. About
content lives in `content/about/<locale>.mdx`, including a localized `metadata`
export. `lib/about/server.ts` is the server-only locale loader. Keep the heading
structure and links aligned across all twelve documents when changing About copy.
Help lives in `content/help/<locale>.mdx` with an exported `title`, loaded only on
the server through `lib/help/server.ts` and passed as rendered content to the game.

There are twelve locales (`en-US`, `fi-FI`, `es-ES`, `de-DE`, `sv-SE`, `fr-FR`, `pt-BR`, `it-IT`, `nl-NL`, `pl-PL`, `ja-JP`, `zh-Hans`). The English module exports `as const`; every other locale uses `satisfies` with the corresponding type from `lib/i18n/types.ts`. Every dictionary module imports `server-only`. Japanese and Simplified Chinese use horizontal left-to-right layouts with system CJK font fallbacks. The `pt-BR` translation is Brazilian Portuguese and is labeled accordingly; Portugal Portuguese would require a separate `pt-PT` translation.

`app/(english)` serves English at unprefixed URLs (`/`, `/about`, `/play`,
and `/game/<id>`) through wrappers that reuse the shared `app/[lang]` pages,
layouts and POST handlers with `en-US` params. Other languages retain their full locale prefixes. No browser
language redirect or locale cookie is used. Old `/en-US` URLs return permanent
308 redirects to their unprefixed equivalents, preserving paths, queries and
POST methods. Use `addLocalePrefix` from `lib/i18n` for links, form actions,
client navigation and canonical URLs; it omits the English prefix. Language-menu
links, metadata alternates and the sitemap use the same public URL convention,
with English as `x-default`. Page caching and Markdown content negotiation
(`Vary: Accept`) remain independent of browser language.

`lib/i18n/negotiation.ts` remains available for localized HTML error responses
from the unlocalized game-creation API; it does not control page routing.

- To add a key, add it to the English dictionary and to every other locale in the same directory; `lib/i18n/dictionaries/dictionaries.test.ts` compares leaf-key paths and placeholders against English.
- Use `GameTranslationKey` and `GameTranslator` from `lib/i18n/types.ts` via type-only imports for game translation calls and helpers. Only dotted string-leaf paths are valid; sections and unrestricted strings are rejected. Keep dynamic keys narrowed to domain unions (street, difficulty, playstyle, lobby guidance), or use an explicit mapping checked with `satisfies Record<Domain, GameTranslationKey>`. Do not cast arbitrary strings or add string-accepting overloads. Interpolation values remain `string | number`; placeholder arguments are not typechecked.
- Format displayed chip amounts explicitly with `formatChips(value, locale)` using the selected app locale, including lobby stacks and blind summaries. Keep numeric input values/parsing, API numbers, game IDs and hand numbers unchanged; do not format all interpolation values automatically.
- To add a locale, add `<locale>.ts` to each dictionary directory, register it in `SUPPORTED_LOCALES` in `lib/i18n/index.ts`, register it in every dictionary-group test registry (each must satisfy `Record<Locale, GroupDictionary>` and cover `SUPPORTED_LOCALES`), and add its dynamic import entry to the matching map in `lib/i18n/server.ts`. Also register native language labels in `lib/i18n/languages.ts` and add translated About and Help MDX documents with loader entries in `lib/about/server.ts` and `lib/help/server.ts`. Script-based locales such as `zh-Hans` need a territory-based Open Graph locale in `lib/seo.ts`.
- Server Components load dictionaries directly through the loaders in `lib/i18n/server` (`getMetadataDictionary`, `getLandingServerDictionary`, `getGameDictionary`).
- The landing page is cached server output: `LanguageMenu` uses locale links and Quick Play retains a native POST form with client-only enhancement. Keep request cookies and game creation in route handlers, outside cached rendering; client identity/attempt initialization runs only in the browser.
- Keep the landing-page **Play** control a plain server-rendered anchor.
  Keep the directory heading and navigation in the server-rendered shell and
  stream its initial data through a Suspense-wrapped request-time Server
  Component; only its form, explicit refresh, pagination, and navigation are client code.
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
- Long-form About and Help content stays in MDX and is rendered by Server Components; do not register it in the game dictionary or any shared provider.
- A future shared interactive component receives its own narrow strings through props.

The landing and About pages use a server-only language menu with a native
`<dialog popover="auto">`. Outside clicks and Escape dismiss it; ordinary locale
links navigate to a new document. CSS anchor positioning places it below the
trigger with a centered fallback. Browsers without popover support show the links
inline. Landing-page Quick Play and Play-page custom-table creation retain native HTML forms with progressive enhancement
and work without JavaScript.

## Documentation standards

Docs are part of the implementation.

- Keep [AGENTS.md](AGENTS.md), [README.md](README.md), and this file aligned with the live codebase.
- Keep the README introductory: project overview, essential setup, basic commands,
  and documentation links. New features do not automatically need README sections;
  it is not a changelog. Update the relevant guide instead: gameplay for user
  behavior, architecture for implementation, deployment for rollout prerequisites,
  and this file for contributor workflows and checks.
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
  Stop at human turns, completed hands, navigation, or lost eligibility. Next hands
  require explicit interaction; bots pause without an eligible open browser.
- Keep database mutations atomic and scoped to at most one action per request.
  LLM credit failures fold and mark the bot leaving in one version-checked RPC;
  apply `20261014000000_add_atomic_bot_credit_departure.sql` before deploying.
  Temporary OpenRouter spending holds, rate limits, and undocumented Jev credit
  failures remain paused. Search Vercel runtime logs for
  `llm_provider_http_failure` or `typesafe_provider_http_failure`; see
  [provider failure behavior](docs/architecture.md) for safe fields and classification.
- Public listings are private by default. Preserve the two-minute database-time
  host lease, 30-second visible-host heartbeat, and server-role-only access.
  Seat claims, moves, bot assignments, releases, start, and settings changes
  must retain the shared game lock and expected-version ordering.

## Safe application diagnostics

Use `classifyApplicationFailure` and `logApplicationFailure` from
`lib/logging/application-failure.ts` for existing unexpected server-route failure
branches. Add operations to its typed allowlist when adding a route. The exact
schema is `event: "application_request_failed"`, `operation`, UUID
`requestReference`, fixed `category`, and numeric response `status`; see
[application failure logging](docs/architecture.md#application-failure-logging).
Never pass arbitrary metadata or exception data to a sink. Preserve expected-error
returns and specialized provider logging without duplicate events. ESLint forbids
direct route `console.error`/`console.warn`; approved server entry points are the
application logger, `lib/bots/provider-logging.ts`, the Realtime
publish/schedule helpers, and the existing bot-claim cleanup notice in the bot
service. Browser Realtime diagnostics must remain fixed text without table IDs.

In server runtime logs, search `application_request_failed`, narrow by operation
or status, and search the exact `requestReference` UUID for a particular event.
References stay internal and do not link provider/publication events. Keep privacy
tests for hostile exception properties and serializers, rejected logger fields,
sink failures, unchanged route responses and browser Realtime failures. Run
`npx vitest run lib/logging lib/realtime app/api/games 'app/[lang]/new-game' 'app/[lang]/quick-game'`
with `npm run check` and `npm run build`; no paid inference is needed.

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
checks against Equity Rules across twenty preflop, flop, turn and river fixtures.
Debatable ranges and sizing remain informational; passing does not establish
overall playing strength. Each bot/model has a separate test group. LLMs
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


Gameplay mutation deadlines belong to the typed browser transport: actions,
settings/seat count, start/next hand, reveals, seat changes, departures and timeout
advancement wait at most 15 seconds; bot steps wait 100 seconds, beyond the
90-second server route allowance. The deadline covers headers and body and
composes with navigation cancellation. Read/feed deadlines remain owned by their
existing coordinators. Creation, discovery, publication and heartbeat requests
retain their existing behavior. The server provider deadline remains 60 seconds.

A deadline, network failure or unusable successful mutation response means an
unknown outcome. The game session synchronously gates all human mutations,
including shortcuts, and makes one bounded authoritative read without replaying
anything. Successful reconciliation asks the player to inspect the table before
another explicit decision; it does not establish that the earlier action failed.
Failed reconciliation releases the spinner while blocking mutations behind
Refresh table. Any later successful authoritative read clears that block.
Uncertain settings stop the start workflow; uncertain departures stay on the
table. Bot unknown outcomes have a separate pause reason: the same hand/actor
remains paused across version-only refreshes until explicit retry; proven turn
progression resumes normal eligibility. Client cancellation does not stop server
inference or release claims. Session generations and abort signals prevent late
results from changing a different table or navigating after unmount.

Connection notices share the existing recovery area above waiting and active tables.
Only browser offline, reconnecting pending a reconciled read, and failed authoritative
reads are visible; healthy polling fallback is silent. Offline takes precedence and
failed reads remain visible during retries. A same-version accepted read clears the
connection failure; feed/catalog responses and fenced late results cannot. Mutation
recovery keeps its specific explanation and one Refresh table button, disabled while
offline or reading. Provider pauses and allowance countdowns remain independent.
Verify `request-recovery.spec.ts` and `bot-advancement.spec.ts` with
`npm run test:e2e:ui -- request-recovery.spec.ts bot-advancement.spec.ts`:
offline → online with a held read, failed read/manual retry, combined unknown outcome,
blocked WebSockets with healthy polling, and desktop/mobile screenshots. Check the
stable polite status text changes only on notice transitions and that Refresh table
is keyboard accessible. Connection recovery must never resubmit a mutation or retry
a paused provider. Navigation resets notices; existing session fences still apply.

The endpoint-to-contract/client checklist is complete:

| Endpoint | Request contract (path/query/body) | Response schema | Named method (`api.` prefix) |
| --- | --- | --- | --- |
| `GET /api/games/:gameId` | `gameParamsSchema` | `getGameResponseSchema` | `games.get` |
| `POST /api/games/:gameId/action` | game params / `submitActionRequestSchema` | `submitActionResponseSchema` | `games.submitAction` |
| `POST /api/games/:gameId/advance-timeout` | game params / strict `advanceTimeoutRequestSchema` | `advanceTimeoutResponseSchema` | `games.advanceTimeout` |
| `POST /api/games/:gameId/advance-departure` | game params / strict `advanceDepartureRequestSchema` | `advanceDepartureResponseSchema` | `games.advanceDeparture` |
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
| `POST /:lang/quick-game` (JSON) | `quickPlayParamsSchema` + `quickPlayRequestSchema` | `quickPlayResponseSchema` | `creation.quickPlay` |
| `GET /api/bots` | no parameters | `botCatalogResponseSchema` | `bots.catalog` |
| `GET /api/games/:gameId/hands/:handNumber/replay` | `replayParamsSchema` | `replayResponseSchema` | `games.replay` |
| `GET /api/games/:gameId/feed?sinceHand=N` | game params / `feedRouteQuerySchema` | `feedResponseSchema` | `games.feed` |
| `GET /api/games/mine` | cookie identity only | `myGamesResponseSchema` (strict assignment counts and `viewerSeated`) | `discovery.mine` |
| `GET /api/games/public?cursor=...` | `directoryRouteQuerySchema`, `directoryCursorSchema` | `directoryResponseSchema` | `discovery.list` |
| `POST /api/games/:gameId/join` | game params / `joinRequestSchema` | `joinResponseSchema` | `discovery.join` |
| `PATCH /api/games/:gameId/publication` | game params / `publicationRequestSchema`, `listingTitleSchema` | `publicationResponseSchema` | `discovery.publication` |
| `POST /api/games/:gameId/heartbeat` | game params (no body/version) | `heartbeatResponseSchema` | `discovery.heartbeat` |

Gameplay and lifecycle contracts live in `gameplay-contracts.ts`; seats,
creation/catalog, feed, and discovery/publication have separate feature
files. Wire query schemas preserve first-value directory cursor parsing and reject
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

## Shared bot context checks

Apply `20261013000000_add_bot_hand_context.sql` and
`20261028000000_add_bot_session_context.sql` before deploying bot-context code.
After applying locally, run `db:types:generate` and `db:types:check` with pinned
CLI 2.120.0. Keep generated output unchanged.
Run `npm run benchmark:poker-context` for the offline weighted 169-class matrix
and seeded heads-up/six-seat wrapper comparisons, and `npm run test:sql:bot-context`
with migrated local Supabase running for private RPC roles and game/hand
isolation. Fixtures roll back; no backfill or reset is needed. CI runs this SQL
suite alongside game reads and seats. Keep server-only facts, projected full
history, independent policy/advice versions, provider privacy and conflict handling
intact. See [methodology and capped live commands](benchmarks/poker-context.md).
All live bot evaluation commands require explicit inference enablement and a
positive `BOT_DECISION_CALL_CAP`, shared across the selected run. The heads-up
pilot requires 640–1,000 requests: 40 fixed decisions, twice, across eight variants
(640 calls), then complete paired seat-swapped blocks against rules/aggressive/passive
opponents when sufficient budget remains. Failures consume the cap; no automatic
retry occurs. Incomplete match blocks are excluded from chip comparisons.
`LLM_API_ENDPOINT` must be the configured OpenRouter gateway; pilot model IDs are
`openai/gpt-5-nano` and `openai/gpt-5.4-mini`, with fallback disabled and strict
parameter support. This does not edit `LLM_BOT_MODELS`.

The unit suite exercises 169 weighted classes at 10/25/100 BB and unequal stacks,
aggregation denominators, street opportunities, sparse evidence, continuity resets,
private-card invariance, legacy coverage and session authorization/version fencing.
The SQL suite additionally covers the 50-completed-hand bound, current-hand binding,
consistent versions, game isolation and actor-specific forced-departure exclusion.
Sanitized pilot reports contain action types, case IDs, counts, numeric usage/cost
and latency only; never save raw requests/responses, historical cards or exceptions.
Jev and Eevo may omit usage/cost; report missing values rather than estimate actual charges.

## Provider failure regressions

`lib/bots/provider-request.test.ts` uses fake timers and abort-aware header/body
mocks for the shared 60-second deadline. Bot-step, credit-departure, typed HTTP,
and localized message tests cover failure categories without live inference.
Run `npx playwright test test/e2e/bot-advancement.spec.ts` against the migrated
local Supabase stack for synthetic API failures, polling suppression, fresh-state
retry, pending-click guards, and silent conflict recovery. These tests do not
contact providers or wait for the real deadline. Run `npm run check` and
`npm run build`, then perform the required
[deployed duration check](docs/deployment.md) before release.

## Bot inference claims

Run `npm run test:sql:bot-claims` against migrated local Supabase. It checks
independent-connection contention, database-time expiry/takeover, token-matched
release, stale/expired fencing, atomic ordinary/credit-departure commits and
rollback, cascade deletion, and restricted SQL roles. It preserves existing games,
cleans up its fixtures, and never loads application `.env` or contacts providers.
This command also runs in the integration job.

Service tests use controlled provider promises and fake clocks. For claim recovery
in a production browser, run:

```sh
npm run test:e2e:smoke -- --grep claim
```

The final `--grep` selects the claim tests instead of the usual `@smoke` subset,
using the same isolated build/server environment. Playwright clocks cover neutral
waiting, polling/Realtime completion, explicit retry at expiry, lost claims,
duplicate retry clicks, navigation and eligibility cleanup without real lease waits.

## Anonymous fair-use admission

See [docs/fair-use.md](docs/fair-use.md) for provisional server-owned allowances,
privacy, proxy assumptions, and rollout. Deploy
`20261016000000_add_usage_admission.sql` and the server-only
`USAGE_LIMIT_HASH_SECRET` (at least 32 random bytes) before application code.
All creation endpoints share owner/IP counters; external TypeSafe/Eevo/LLM attempts
charge the durable table host and game only after context validation and claim
verification. Rules turns bypass inference allowances. Denials preserve tables
and require explicit retry; rules-only Quick Play creates a separate private game.
Run `npm run test:sql:usage` against migrated local Supabase; CI includes it before
production browser smoke. The smoke suite also covers fair-use countdowns,
explicit retry, rules replay, and localized HTML/typed JSON creation denials.

## Client bot lifecycle

`components/poker/bot-lifecycle.ts` owns pure transitions. `useBotLifecycle.ts`
executes them through the testable `BotLifecycle` driver, owns timers and request
generations, and calls the existing twelve-step `advanceBotTurns` helper. All
advancement entry points share its guard. Its automatic-turn predicate includes
claimed leaving humans and humans with an overdue authoritative decision.
Timed decisions schedule one shared-loop attempt using server time plus monotonic
elapsed time; navigation and mutation guards cancel or defer it. Timeout turns use
`games.advanceTimeout`, while leaving humans retain departure precedence. Those departure turns use `games.advanceDeparture` with a game envelope
and no AI decision; bot turns retain `games.stepBot` and all provider/claim/usage
pause rules. A different departing-human actor clears the prior bot-turn pause. `useGameSession.ts` retains authoritative
state, response sequences/reconciliation, polling, Realtime, feed, and
non-bot mutations. Reconciliation notifies the lifecycle synchronously; lifecycle
refreshes carry a generation predicate before session reconciliation. Inference
already running on the server is never cancelled.

| State / event | Result |
| --- | --- |
| Idle, eligible new automatic version or explicit continuation | Running; one loop |
| Departing-human turn | One engine fold; no provider, usage admission or claim |
| Ordinary human turn before deadline, or completed hand | Stop advancement |
| Overdue human decision | One legal check or fold through `games.advanceTimeout`; no seat removal, provider, allowance or claim |
| Early timeout response | Wait the server-provided interval before another attempt |
| Timeout failure | Pause the decision across version-only refreshes until explicit retry |
| Running, successful step | Reconcile and report accepted decision; continue up to twelve steps |
| Running, version conflict | Refresh silently and end stale loop; refresh failures remain visible |
| Running, transport failure or invalid success | Reconciling unknown outcome; one bounded read, no resubmission |
| Unknown reconciliation, same hand/actor | Pause across version-only updates until explicit retry |
| Unknown reconciliation, proven turn progression | Resume normal eligibility-based advancement |
| Running, provider failure | Paused by game/hand/actor, including version-only refreshes |
| Running, claim in progress | Quiet version-fenced wait until advancement or deadline |
| Claim deadline | Paused with retry notice; no inference |
| Running, lost claim | Immediate refresh; same attempted turn/version needs explicit retry |
| Running, usage denial | Usage limited with retained deadline and 250 ms countdown |
| Usage deadline | Explicit retry enabled; no inference |
| Manual retry | One guarded authoritative refresh, then recheck eligibility and advance |
| Authoritative turn change, lost eligibility, navigation or unmount | Invalidate pending continuations and clean timers |

Run `npm run check`, `npm run build`, and the isolated production scenarios:

```bash
npm run test:e2e:smoke -- test/e2e/bot-advancement.spec.ts --grep ''
npm run test:e2e:smoke
```

Run those browser selections separately: selecting the full bot suite plus other
creation-heavy suites in one run can exhaust the real local IP creation allowance.
See [extraction characterization notes](docs/bot-lifecycle-characterization.md).

## Personal table verification and rollout

Apply `20261017000000_add_my_games.sql` and
`20261026000000_add_personal_summary_composition.sql` before deploying matching Play
application code. The latter replaces `list_my_games` in place, with no compatibility
RPC. It returns only public summary fields with nonnegative composition counts that
sum to occupied seats and a validated ownership boolean.
With the migrated local stack running, `npm run test:sql:my-games` checks seated
owners, unseated hosts, host/seat deduplication, released seats, unrelated visitors,
completed/error games, assignment counts, stable ordering, five-item limits and
restricted SQL roles, departing/eliminated claimed assignments and exclusion-before-limit behavior. Fixtures roll back; the runner never reads application `.env`
or resets the database. CI runs it before production browser smoke.

`npm run test:e2e:smoke -- test/e2e/play.spec.ts test/e2e/public-lobby.spec.ts`
checks the production Play experience against local Supabase with isolated browser
identities. All Play cases carry `@smoke`; retain normal diagnostics and teardown.
Personal and public initial loads must remain in separate uncached Suspense
boundaries. Personal failures must remain visible and private; do not log lists,
tokens or repository errors. Preserve shared candidate caching only for the public
directory, with request-specific host/seated exclusions. Play never polls or subscribes
to Realtime. Personal tables load on page entry and offer Retry after failure; the
public section has an accessible refresh icon. The optional joining name appears at
the top. Compact personal rows have separate links and removal buttons; public rows are native buttons, retaining
keyboard activation and pending join protection. Personal metadata wraps on mobile;
relative update labels use the selected locale, start as absolute UTC for SSR/hydration,
and update only on mount, changed summaries and visibility return. Exact UTC remains in
the time label/tooltip. Verify title/composition variants, relative boundaries, skew,
hydration and production screenshots in the Play/component tests. Both creation forms retain localized native POST routes; initialized JavaScript uses the typed custom JSON API or Quick Play JSON-response path.


## Departure verification and rollout

Apply `20261019000000_add_human_departures.sql` before the application. Header
Leave table and Stand up use one atomic release service; only Leave table navigates
on acknowledgement. Header Leave table requires another claimed human seat;
the last human sees Lobby without confirmation or departure. Lobby preserves
seats and goes to localized Play. New labels
and confirmations belong in every server-owned game dictionary; Play Quick Play
uses the existing localized HTML creation and fair-use flow.

`test:sql:departures` preserves existing games, runs rollback fixtures, and creates
and deletes its own cross-connection race fixtures. CI runs it after seat checks.
The production browser departure suite covers cancellation, stale retry, mobile
controls, acknowledgement gating, Stand up watching, localized Lobby, Play Quick
Play, and remaining-browser continuation after the departing browser closes.
Run it locally with `npm run test:e2e:smoke -- test/e2e/departure.spec.ts`, then
verify departure and notification delivery on an authorized Vercel deployment.

## Table removal verification and rollout

Apply `20261025000000_add_host_personal_removal.sql` before deploying host personal
removal. Hosts with other claimed humans can use **Remove from my tables** without
deleting shared history. This host-only `remove_from_list` operation atomically
departs the caller’s own human seat, if any, and records a private exclusion.
Unseated hosts only hide the row and keep the game version unchanged. Durable host
authority remains; URL visits do not restore the row, but successful non-departing
seat claims do. Whole-table deletion still blocks on every other claimed human.


Apply `20261020000000_add_table_removal.sql` before deploying the application.
Also apply `20261021000000_grant_table_removal_reveal_delete.sql`; removal requires
an explicit service-role DELETE grant on card reveals. Broader local default
privileges can mask a missing hosted grant.
`POST /api/games/[gameId]/remove` accepts only `expectedVersion` and the explicit
`delete`, `leave_and_remove`, or `remove_from_list` operation through discovery contracts and `api.discovery.remove`.
Cookie identity and service-role RPCs own authorization; no ownership tokens enter
summaries or responses. All other claimed human assignments block host deletion,
including folded, eliminated and departing players. The transaction deletes history
before seats and preserves fair-use counters. Joined removal reuses engine-validated
departure and atomically records a private exclusion before list ordering/limits.
New claims restore excluded rows; visits and pending-departure claim retries do not.

Run `npm run test:sql:removal`, `test:sql:my-games`, `test:sql:departures` and
`test:sql:seats` on migrated local Supabase, then `npm run check`, `npm run build`
and `npm run test:e2e:smoke`. Removal SQL is included in CI after personal lists.
Host-removal test setup uses `createUITable` from `test/e2e/ui-fixtures.ts` so
it does not spend the shared IP creation allowance needed by creation-limit tests.
The helper restricts direct fixtures to local production Supabase and cleans them
up after each test; browser removal mutations still use real application routes.
The removal browser suite covers seated and unseated host personal removal,
shared history preservation, cancellation, deletion blockers, list refill, explicit
conflict retry, duplicate prevention, keyboard/mobile controls and deletion recovery.
`confirmation-recovery.spec.ts` additionally covers changed operations, failed list
reconciliation, invalid successes, acknowledged removal followed by list failure,
live departure phase/eligibility changes and uncertain registered departures.
Run the focused production selection with:

```bash
npm run test:e2e:smoke -- test/e2e/departure.spec.ts test/e2e/table-removal.spec.ts test/e2e/confirmation-recovery.spec.ts test/e2e/dialogs.spec.ts test/e2e/request-recovery.spec.ts --grep '@smoke|@ui-regression'
```

Screenshots in `test-results/` show the four confirmations, mobile layouts,
pending requests, changed eligibility/operations and recovery feedback. Inspect
them alongside traces/HTML reports. Confirm Cancel initially receives focus,
Tab stays inside the dialog, Escape/backdrop dismissal works before submission
and is disabled during submission, and removed-row focus falls back to the
stable Play heading even when the list becomes empty. Confirmation presentation
owns no API calls; MyTables and the game session retain mutation guards and
recovery. No new migration or HTTP contract is required for these dialogs.
Verify two-browser Realtime delivery on an authorized Vercel deployment containing
this change; polling must still detect deletion if Broadcast fails.

## Human turn timer checks

Run `npm run test:sql:turn-timers` against the migrated local stack. Its rollback
fixtures cover deadline preservation, early/expired/stale requests, driver roles,
legacy fences, completion and seats. Committed disposable fixtures use independent
connections for timeout/timeout and manual/timeout races and clean up in finally.
CI runs this before browser smoke. Timer browser fixtures are created directly in
the local database and cleaned up in finally, preserving shared admission counters.
`turn-timers.spec.ts` checks two-browser expiry,
reloads, repeated hands, legal checks, same-actor new-street IDs, retained seats,
solo suppression and existing Off tables using short injected local fixture deadlines.
The existing bot-advancement Quick Play fixtures also assert timer Off.
Preview verification uses ordinary durations and the existing Realtime two-browser
smoke, because local DB fixture injection is intentionally unavailable for previews.

The game UI coordinates a single typed overlay through `useGameOverlay` and the
pure `game-overlay.ts` transitions: none, mobile Actions, Join table, Help,
Settings, Leave table, Review hand, or About this bot. Keep DOM references and
Actions reading position in the hook, navigation rules in the pure module, and
rendering/requests/mutations in existing feature components. Close and Back
callbacks capture an instance token; never bypass it in asynchronous Join completion.
A game ID change resets navigation and return context. Join and bot information
have eligibility invalidation; Leave retains its explanatory/recovery states and
pending-dismissal protection. See the compact transition table in
[architecture](docs/architecture.md). `game-overlay.test.ts` covers every kind,
replacement, replay origins, Back/Close, eligibility and stale completions across
replacement, reopening and game changes. These overlays use `components/poker/Modal.tsx`, opened through
native `showModal()` for focus containment and inert background content. The
wrapper owns Escape/backdrop dismissal, scroll locking, initial focus, and focus
restoration to the opener or the stable table container (Help for bot information or replay). Restore only on the
same page while the table remains mounted; content refreshes must not refocus or
remount the feed. The Actions collapsed preference remains independent of modal
ownership. Gameplay keyboard shortcuts must return immediately while any
modal is open. Timers, bot/departure advancement, Realtime and authoritative
refreshes continue normally. Dismissing Join table does not cancel a submitted
claim. Replay replaces mobile Actions; Back to Actions restores its saved reading
position. Replacement skips old-dialog focus restoration while another dialog is
open. Verify changes with `test/e2e/dialogs.spec.ts` alongside betting controls
and Actions-feed regressions using the existing Chromium configuration.

Replay verification uses `lib/poker/hand-replay.test.ts`, route contract tests and
`test/e2e/hand-replay.spec.ts`. Keep privacy assertions on serialized fields and
immutable ownership (including reused seats, duplicate names and departures),
fail-closed invalid histories, engine runout/street frames and exact per-pot awards.
Run `npm run test:sql:replay` against the migrated local stack: disposable fixtures
verify SQL roles, ordered actions, cross-game/hand reveal isolation, missing/deleted
hands and consistent reads during a partially written uncommitted transaction.
The integration workflow runs this after SQL game reads. It never resets the stack,
loads application environments or calls providers. Keep generated types pinned.
Run `npm run test:e2e:ui -- hand-replay.spec.ts hand-results-actions.spec.ts dialogs.spec.ts settings.spec.ts`
for both entry points, boundaries, mobile return, focus/keys, load/retry, late
responses, frame preservation and a live timed turn during review. Arrow navigation is owned by the open replay modal’s lifetime, so native focus
loss when a boundary button disables must not strand navigation. Ignore modified
keys and editable controls, and remove the listener on close/navigation. Replay must
never gate the live session's polling, bots, departure advancement or timers.

The in-table bot-name buttons open `BotInformationModal` through the same overlay
state. Store only immutable participant ID and resolve current public metadata from
`poker.players`; never fetch a catalog or infer a provider from a display name.
Close if the participant disappears or ceases to be a bot. Focus Close initially
and restore the opener, falling back to Help if it disappears. Keep this overlay
independent of request/recovery and turn advancement. Concise copy belongs in every
server-owned game dictionary; provider/setting descriptions must agree with About
MDX and production policy. `bot-information.spec.ts` covers Chromium dialog behavior
and the focused desktop/mobile WebKit compatibility projects, with screenshots.

Help content lives in `content/help/<locale>.mdx`, with a localized exported title
and three matching sections: hand rankings, betting basics and keyboard shortcuts.
Update every relevant localized document whenever controls or gameplay terminology
change. Keep examples valid five-card hands in strongest-to-weakest order, explain
raise targets versus additional payment, and preserve the multiplayer timer warning.
Keep prose out of game dictionaries and client imports. `lib/help/content.test.tsx`
compiles all documents and validates examples through the poker adapter; game page
tests cover locale composition, and tagged dialog regressions cover focus, scrolling,
shortcuts, pending/recovery access, expiry and layouts from 320px to desktop.

## Turn notifications

An actionable owned human turn sets the browser tab to “🟢 Your turn · AI Hold’em”
(localized). Pending mutations, unresolved recovery, offline state, departure, and
turn expiry clear the indicator. Opening a dialog leaves the turn indicator active.

The **Turn sound** switch in **Settings** is off by default. A check with the thumb on
the right means On; a cross with the thumb on the left means Off. It shares the
versioned `ai-holdem-settings` local-storage entry with **Gameplay shortcuts**, which defaults to On. Changes apply immediately and synchronize between
tabs; removed, malformed, or unsupported entries reset to defaults. Legacy sound
entries are ignored. Storage failures leave the controls usable in memory. Enabling it
previews a quiet two-note cue. Browser audio requires a user gesture, including
after loading a stored preference; missed cues are never replayed. Initial loads
and returns from hidden tabs update the title without a catch-up cue. Background
notifications are best effort: browsers may suspend tabs or block audio. Separate
open game tabs can each sound. No permissions, push service, or background worker
is used, and polling behavior is unchanged.

## In-game Settings

The header offers Help, Settings, and Leave table/Lobby. Settings uses the shared
Modal with initial focus on Close, Escape/backdrop dismissal, focus restoration,
and independently scrolling content. It remains available during pending requests
and recovery. The game, timers, bots, refreshes, and turn notifications continue
while it is open; gameplay shortcuts are suppressed by the overlay.

**Show current hand** defaults to On in the version-1 Settings entry; older entries default the missing `showCurrentHand` to true and retain other preferences. It controls display only. Keep the category and status separate on every Seat layout, reserve the category slot in every seat regardless of preference, float status/action text on the bottom border without resizing seats, and pass explicit viewer identity. Production Settings UI tests cover category changes, storage/reload, desktop/mobile spacing, long translations and unchanged showdown results; adapter and contract tests cover visible-card evaluation and privacy.

**Card colours** uses a labelled native selector: **Classic** (default) or
**Four-colour**. Classic keeps dark spades/clubs and red hearts/diamonds;
Four-colour uses dark spades, red hearts, blue diamonds and green clubs.
Changes apply immediately to table cards, winning-five results, desktop/mobile
Actions and compact Help examples. Symbols and accessible card names stay the
same, as do card backs, placeholders, dimensions and winning-card underlines.
The version-1 `ai-holdem-settings` entry stores `cardColours`; older entries default
this field to `classic` while preserving sound and shortcuts. Server rendering
starts with Classic and the saved palette loads after hydration. Storage removal
resets defaults; unavailable storage still allows changes in the current tab.

Turning off Gameplay shortcuts removes action badges, Q/E/Shift hints and custom
`aria-keyshortcuts`, and restores native slider keyboard behavior. Tab navigation,
Enter/Space on focused buttons, numeric editing and dialog keys remain available.
Shortcut listeners attach only after saved settings have been read after hydration.
`settingsSchema` defines the browser-safe model and inferred type; `settingsCodec`
validates decoding from JSON and encoding to JSON. Invalid stored values fall back
to the complete default object rather than filling individual missing fields.

Language uses the supported locales’ native names and the current route locale.
Switching navigates to the same game with its query string and fragment, retaining
seat identity; English uses the unprefixed URL. The selector is disabled during
game mutations, bot advancement, Quick Play creation, unresolved recovery and language
navigation. The handler rechecks this guard. Language and player identity are never
stored in settings. Cross-tab sound changes never preview or unlock audio.

Run `npm run check`, `npm run build`, and `npm run test:e2e:ci` for Settings changes.
Tagged `test/e2e/settings.spec.ts` covers accessibility, mobile layout, preference
synchronization, native keyboard controls, language ownership and busy/recovery
guards. Turn-notification tests cover preview and cue behavior; timer smoke verifies
expiry while Settings remains open. Desktop/mobile screenshots are saved under
each project-qualified Settings test directory under `test-results/`.

## Creation retry verification

Run `npm run test:sql:creation` with migrated local Supabase. Isolated fixtures
check concurrent identical attempts, single owner/IP charge, differing intent,
rollback, denial, independent owners, deletion tombstones and restricted roles.
CI runs it before usage and production browser checks. Run `npm run test:e2e:ci`
for repeated clicks, committed lost responses, explicit retry, reload recovery,
first-visit identity, unavailable storage/cookies, identity changes and subsequent
intentional creation. Preserve Play names in initial configuration/hand history
and anonymous landing Quick Play. The controller owns a 15-second creation
deadline; native forms remain usable without duplicate-safe retry guarantees.
Pending session records must never contain tokens, and creation diagnostics must
never log attempt IDs, fingerprints, submitted names or payloads.

### Conditional range-equity evaluation

The independent Plan 1 range calculator lives under `benchmarks/range-equity/`.
Run `npm run benchmark:range-equity` for conditional weighted-range sensitivity,
exact river/seeded sampling checks, convergence and latency by opponent count.
See its [reproduction guide](benchmarks/range-equity/README.md) for pinned offline
PokerKit validation. This tooling makes no inference requests and changes no
production policies. Run `check`, offline `test:bots`, and `benchmark:poker-context`
after changes to it; automatic range inference remains deferred.

### Equity Rules challenger evaluation

Run `npm run benchmark:equity-rules` for the benchmark-only Plan 2 challenger.
It compares frozen, corrected-facts and structured policies with 500 paired seed
blocks per opponent/difficulty at two and six seats, plus fixed decisions for
three through five seats. `RULES_BLOCKS=2` is a mechanics check only. See the
[protocol and reproduction guide](benchmarks/equity-rules/README.md) for sampling,
whole-block bootstrap intervals, exclusions, conditional range contrasts and
worker isolation. No providers or database are used. Run `npm run check`, offline
`npm run test:bots` and `npm run benchmark:poker-context` after changes; production
promotion requires a later evidence-based plan.

### Explicit heads-up Jev evaluation

Run `npm run benchmark:jev:heads-up` for frozen offline memory mechanics and
`npx vitest run benchmarks/heads-up/reference.test.ts` for importer, sampling,
matching, scoring, privacy, full-hand pairing and budget tests. Also run
`npm run benchmark:poker-context`, offline `npm run test:bots` and `npm run check`.
See [the source audit and protocol](benchmarks/heads-up/README.md). No chart source
passed; no chart-dependent paid decision or match run is currently enabled.

The dated live memory command is `EXTERNAL_INFERENCE_ENABLED=true
BOT_DECISION_CALL_CAP=108 npm run benchmark:jev:memory:live`, with
`TYPESAFE_API_KEY` in ignored `.env.test` or the shell environment. The command does
not load application `.env`. Credential preflight precedes persistent reservation.
It verifies frozen policy/fixture SHA-256 hashes, reserves each attempt before
network dispatch, and refuses an existing evidence/start ledger. Never remove
the marker to get around the cap; a separately authorized run needs its own dated
ledger while preserving prior evidence. The source-failure protocol permits only
108 provider attempts, not spending unused chart allocations. All provider
failures count; no automatic retries/substitutions are allowed.

Current policy remains `jev-latest` with medium difficulty and unchanged guidance.
Pure mechanics and frequency compliance are not playing-strength evidence.
Memory changes are sensitivity observations; quality needs an independently
supported reference. Paired chip reports exclude unfinished four-hand blocks and
bootstrap whole blocks by opponent; fewer than 30 blocks are exploratory.

### Eevo verification

Eevo shares `lib/systemone/` and `lib/bots/systemone.ts` with Jev. Keep Jev's
prompts, policy version, difficulty sampling and exact river safeguards unchanged
when adjusting transport. Mock HTTP in unit tests; unsupported decisions fail
without fallback. Eevo has distinct safe diagnostics and never takes the LLM
credit-departure path. Production execution shares authorization, database claims,
allowances, deadline and explicit retry behavior.

Run `npm run check`, `npm run build`, pinned `db:types:generate` and
`db:types:check`, `test:sql:seats`, `test:sql:bot-context`,
`test:integration:bot-pipeline` and `test:e2e:ci` against migrated local Supabase.
The deterministic pipeline includes Eevo lifecycle/history, competing claims,
unauthorized/stale calls, allowance denials and provider failures without keys.
Isolated launchers clear/reject `EEVO_API_KEY`, and production browsers also force
`EEVO_QUICK_PLAY_ENABLED=false`. Real credentials belong only in ignored `.env.test`
for opt-in live evaluations with a shared `BOT_DECISION_CALL_CAP`.

The SystemOne extraction has a separate offline source freeze at
`benchmarks/baselines/systemone-v4-freeze.json`. Historical paid evidence and the
dated live runner retain their original freeze and refuse changed dependencies;
do not rewrite evidence hashes to authorize a new live comparison.

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


Production confidence advice is covered by `lib/bots/jev-confidence.test.ts`
and `lib/bots/eevo-confidence.test.ts`. Both providers share the same advice
envelope; verify Eevo's distinct model and error mapping without fallback.
Keep the production registry wiring, sparse/unknown suppression, Wilson thresholds,
size/street matching, privacy and one-request candidate/schema checks intact.
The production text includes explicit sizing caveats and excludes all-in opening
candidates from tendency annotations. It has no paid strength validation; do not
present the archived experimental wording as validation of this revision.
Frozen Plan 3 runners intentionally reject the newer registry hash. Use a separate
checkout of archival commit `62d7bc6` for reproducible offline experiments; their
paid allocations remain exhausted. See the promotion record.

The Eevo extension has offline contract/safety coverage only; Jev pilot behavior
is not evidence of Eevo playing strength. No additional provider calls are made
without fresh explicit authorization.

## Production bot predictability audit

`npm run benchmark:bot-audit` disables external inference and evaluates current
Equity Rules across 169 classes, all existing preflop nodes and difficulties, plus
engine-replayed equivalent representations. `benchmark:bot-audit:analyze` rebuilds
summaries from sanitized evidence without credentials or inference.
`benchmark:bot-audit:live` requires fresh explicit authorization, a new immutable
source/input manifest, all three provider credentials and a persistent shared
972-decision allocation (hard cap 1,000). Failed calls consume budget; interrupted
runs cannot resume automatically. See the [audit guide](benchmarks/bot-audit/README.md)
for exact reproduction, privacy, freezing and interpretation limits. No build, SQL
or browser checks are needed for changes confined to this benchmark.

The dated 972-request bot-audit pilot is complete and its paid authorization is
exhausted. Preserve its ledger and compressed evidence; do not delete a ledger
or reuse its confirmation token to rerun it. See the
[completed report](benchmarks/bot-audit/live-report-2026-10-15.md).

The benchmark-only bot improvement follow-up uses `npm run benchmark:bot-improvements`
for offline Rules traces/invariants and paired matches. Its separate frozen live pilot
uses only Jev and OpenRouter with a shared 600-attempt cap, durable no-replay ledger
and no retries/fallbacks. See [the experiment guide](benchmarks/bot-improvements/README.md).
Never reuse the exhausted original audit allocation or overwrite its evidence.

The 2026-10-15 improvement pilot completed all 600 approved Jev/OpenRouter
requests with no failures, plus 72,000 offline hand attempts with no excluded
blocks. Its authorization is exhausted. All candidates remain benchmark-only;
see [the report](benchmarks/bot-improvements/report-2026-10-15.md).

The offline preflop action-value study uses `npm run benchmark:preflop-action-value`
(and `-- smoke` for two small blocks). Its source-frozen workers have no provider
credentials or environment-file loading. Whole-seed failures exclude every paired
alternative; no fallback actions replace them. `benchmark:preflop-action-value:analyze`
rebuilds summaries from completed compressed evidence. Preserve existing evidence;
changed experiments need a new version. See [the guide](benchmarks/preflop-action-value/README.md)
for sampling, checkpoint recovery, decision-point stack accounting and interpretation.

The completed preflop action-value study contains 54,000 paired seed blocks and
184,500 continuations after deduplication within each seed block with zero exclusions. See [its report](benchmarks/preflop-action-value/report-2026-10-15.md)
for conditional findings and sampling-budget limits; no production candidate was promoted.

The focused KK/QQ candidate study uses `npm run benchmark:preflop-candidate` for
fixed checks, screen, selection and confirmation at 5,000 equity samples per Rules
decision. `-- smoke` is credential-free and writes no evidence; `-- analyze`
reproduces saved results. A single coordinator checkpoints complete paired blocks
and resumes only matching frozen work. Never overlap schedulers, replace failed
blocks, change selection after holdout, or promote a candidate automatically.
See [the guide](benchmarks/preflop-candidate/README.md) for allocations, gates,
lock recovery, archive integrity and interpretation.

The [completed candidate report](benchmarks/preflop-candidate/report-2026-10-16.md)
records 192 development and 480 confirmation blocks with zero exclusions. Medium
KK raise-to-3-BB passed the conditional-value gate; hard QQ call remains deferred.
The historical benchmark itself does not promote candidates; the subsequent reviewed implementation promotes only the medium-KK guard described below.


Production now promotes only the confirmed medium-KK 3-BB opening via
`OpeningAwareEquityRulesBot`; the original Rules class remains the historical
baseline. For frozen candidate reanalysis, use the
[verified baseline recovery procedure](benchmarks/preflop-candidate/README.md#preserved-baseline-reanalysis)
in a fresh directory. Live source changes must fail the old freeze checks.
Run `npm run check` for promotion regression tests; do not rerun confirmation or
modify the saved selection. QQ remains deferred.

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

## Session adaptation benchmark

The [session adaptation guide](benchmarks/session-adaptation/README.md) documents
offline verification, source freezing, fresh paid authorization, progress output,
exclusive non-resumable request accounting and credential-free report generation.
Run the full offline benchmark before preparing a freeze; existing pilot allocations
cannot authorize this experiment. Production code and SQL remain unchanged.

The session pilot has a separately authorized [one-time continuation amendment](benchmarks/session-adaptation/README.md#explicit-amendment-six-untouched-blocks-after-first-interruption)
for six untouched blocks after a recorded provider timeout. It preserves and excludes
the two incomplete original blocks, pins both evidence lineages, and caps combined
reservations at 4,489. It permits no replay or automatic further restart.

A subsequent [LLM-only amendment](benchmarks/session-adaptation/README.md#explicit-amendment-llm-only-after-quota-increase)
after an operator-reported OpenRouter quota failure permits only two untouched
LLM blocks, skips the remaining Jev blocks and caps further/combined reservations
at 1,200/2,757. All four incomplete blocks stay excluded; no replay is permitted.

The offline [river lookahead experiment](benchmarks/river-lookahead/README.md)
uses a credential-free, network-blocked worker rather than Vitest's environment
loader. `npm run benchmark:river-lookahead -- smoke` verifies frozen inputs and
runs one non-writing case; `-- full` records the 12-fixture root-action matrix.
Completed evidence and source freezes are immutable; reproduce in a separate
checkout as described in that guide. Run the existing range-equity benchmark
and `npm run check` alongside it. No build, Supabase or paid provider is needed.

## Shared replay verification

Run `npm run test:sql:shares` against the running migrated local stack. It uses
fixture-owned data, no environment files, providers or reset, and covers restricted
roles, historical ownership, changed-history rejection, concurrent creation,
unchanged 30-day expiry, separate admission, revocation, expiration and deletion.
Run `npm run test:e2e:ui -- hand-replay.spec.ts shared-replay.spec.ts hand-results-actions.spec.ts dialogs.spec.ts settings.spec.ts`
for the stacked header sharing dialog, top-dialog focus/Escape isolation, nested
scroll locks, frame/focus restoration, folded-seat dimming,
create/notice/copy/fallback/revoke, standalone playback, locale routing,
no-source HTML/JSON, no live activity, unavailable links and modal regressions.
Unit visibility cases cover folded owner/bot, showdown/explicitly shown humans and
unrevealed folded humans across every frame, duplicate names and seat reuse.
Do not put viewing tokens or snapshots into logs/telemetry. Diagnostic artifacts
containing fixture URLs must never contain production links. Verify platform URL
retention and no-referrer in the deployment checklist. Shared pages use generic
noindex/nofollow metadata and never enter the sitemap.

| Endpoint | Input | Response | Named method |
| --- | --- | --- | --- |
| `GET /api/games/:gameId/hands/:handNumber/share` | `replayParamsSchema`, ownership cookie | `shareManagementSchema` | `shares.active` |
| `POST /api/games/:gameId/hands/:handNumber/share` | same, same-origin | `shareManagementSchema` | `shares.create` |
| `DELETE /api/games/:gameId/hands/:handNumber/share` | same, same-origin | `revokeShareSchema` | `shares.revoke` |
| `GET /api/replays/:token` | `shareTokenSchema` | `sharedReplaySchema` | `shares.read` |

### Manual river candidate study

The offline [river candidate v1](benchmarks/river-candidate/README.md) has separate
`benchmark:river-candidate -- smoke`, `-- development`, `-- confirmation` and
`-- analyze` stages. The user runs the two long stages manually; implementing
assistants may run focused tests and smoke but must not launch/poll full studies.
Retain both immutable phase archives and `benchmarks/results/river-candidate-v1/`
checkpoints. Confirmation enforces development qualification; analysis verifies
saved actions and payouts without rerunning decisions. Frozen-source drift or
failures require a new version rather than replacement evidence. No provider,
server, database or environment-file loading is needed. Production promotion is
conditional on manual evidence review and successful post-change required checks.
