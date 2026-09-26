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

## Translations

Translations are physically split by route and usage under `lib/i18n/dictionaries/`:

| Directory | Consumer |
|---|---|
| `metadata/<locale>.ts` | `generateMetadata` in the locale layout |
| `landing-server/<locale>.ts` | landing page Server Component prose |
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
- Client game components receive the game route's `I18nProvider`, which serves the combined game dictionary from `app/[lang]/game/[gameId]/layout.tsx`.
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
- Keep database mutations atomic and scoped to at most one action per request.

## Pull requests

- Keep PRs small, focused, and easy to review.
- Include tests for behavior changes and bug fixes, especially for stale, illegal, unauthorized, or privacy-sensitive paths.
- Call out migrations, env changes, or deployment implications explicitly in the PR description.
- State which verification commands you ran and their result.
- If the change affects docs, include the doc update in the same PR.

## Questions

If a project rule or workflow is unclear, prefer the current code and project docs over older notes, assumptions, or stale examples.
