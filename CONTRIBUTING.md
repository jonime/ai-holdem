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

TypeSafe policy changes should also run `npm run benchmark:policy`. This mocked,
seeded benchmark is cost-free and safe for local regression checks. Live Jev
evaluation is opt-in only via `npm run benchmark:typesafe:live`; it requires
external inference and a TypeSafe API key, performs one paid request per bot
turn, and is not part of CI.

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

Also run the two-browser smoke test on a Vercel preview containing your change:

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
visitor-specific directory marked `noindex, follow`. Set `NEXT_PUBLIC_APP_URL`
for custom domains before building; see README for origin fallbacks and social
image replacement.
