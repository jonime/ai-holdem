# Route-scoped translations with explicit server/client boundaries

## Summary

Physically split translations by route and usage. Remove the global translation provider, pass the landing page’s five interactive strings through props, and provide one combined lobby/game dictionary at the game route layout.

The future About page is **not implemented**. Document how to add its translations exclusively on the server.

Success means server-only dictionaries never enter browser JavaScript or client component props. Rendered server text still appears in HTML and RSC output, as expected.

## Current implementation and target structure

Repository root: `/Users/joni/Workspace/ai-holdem`.

Current behavior:

- The locale layout loads the complete dictionary and passes it to `I18nProvider`, affecting every route.
- The landing page renders most content on the server. Only `LanguageSelector` and `NewGameForm` need client translations.
- Lobby and active play are states of `PokerApp` under the same game route.
- `view-model.ts` imports the English dictionary at runtime for fallback labels. This creates a separate client import path that must be removed.
- The developers page is already server-rendered English content.

Create the following structure under the existing `lib/i18n` directory:

```text
types.ts
server.ts
dictionaries/
  metadata/<locale>.ts
  landing-server/<locale>.ts
  landing-client/<locale>.ts
  game/<locale>.ts
  dictionaries.test.ts
```

Each directory contains all ten existing locales: `en-US`, `fi-FI`, `es-ES`, `de-DE`, `sv-SE`, `fr-FR`, `pt-BR`, `it-IT`, `nl-NL`, `pl-PL`.

Use this exact migration mapping:

| Dictionary | Shape and source |
|---|---|
| Metadata | Existing `metadata` object, flattened to `{ title, description, logoAlt }`. |
| Landing server | Existing `home` object, excluding `language`, `yourName`, `anonymous`, and `newGame`. Retain the currently unused `title` to avoid unrelated cleanup. |
| Landing client | `{ language, newGame: { yourName, anonymous, newGame, createGameError } }`. Copy from the four excluded `home` keys and `errors.createGame`. |
| Game | Existing top-level `gameHeader`, `connection`, `lobby`, `table`, `seat`, `history`, `feed`, `cards`, `errors`, and `actions`, preserving their structure. |

Preserve every translated value and interpolation placeholder. Keep `errors.createGame` in the game dictionary too: `useGameSession` uses it. This small duplication avoids introducing global shared translations.

## Implementation

### Dictionary loading and types

- Add `import "server-only"` to **every dictionary module**, including dictionaries whose values will be passed to clients. “Client” describes their consumer, not their import environment.
- Export these types from the new types module: `MetadataDictionary`, `LandingServerDictionary`, `LandingClientDictionary`, and `GameDictionary`.
- Derive each shape from its English dictionary using type-only imports and the existing recursive string-widening pattern. English exports its object `as const`; other locales use `satisfies` with the corresponding type. The types module must have no runtime dictionary imports.
- Replace the all-purpose `getDictionary` with:

```ts
getMetadataDictionary(locale: Locale): Promise<MetadataDictionary>
getLandingServerDictionary(locale: Locale): Promise<LandingServerDictionary>
getLandingClientDictionary(locale: Locale): Promise<LandingClientDictionary>
getGameDictionary(locale: Locale): Promise<GameDictionary>
```

- Keep these functions in the server-only loader module. Give each dictionary group an explicit locale-to-dynamic-import map, checked against `Record<Locale, () => Promise<CorrespondingDictionary>>`.
- Use literal import paths for every locale. Do not import complete locale aggregates or reconstruct a global dictionary.
- Keep locale validation at the route boundary with `hasLocale` and `notFound`. Preserve existing locale helpers and URL behavior.
- Remove the old monolithic dictionaries and `Dictionary` type once all callers and tests have migrated.

### Root layout and landing page

In the locale layout:

- Remove the provider import, dictionary load from the layout body, and provider wrapper.
- Keep locale validation, `<html lang>`, font setup, and static locale generation.
- Update `generateMetadata` to load only `MetadataDictionary`. Preserve existing metadata values and URLs.

In the landing page:

- Preserve its Server Component status and existing `"use cache"` directive.
- Load metadata, landing-server, and landing-client dictionaries concurrently after validating `lang`.
- Render headings, paragraphs, links, accessibility labels, image alt text, and structured data directly from server dictionaries.
- Pass only these props across the client boundary:

```ts
LanguageSelector({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
})

NewGameForm({
  locale,
  messages,
}: {
  locale: Locale;
  messages: LandingClientDictionary["newGame"];
})
```

- Remove both components’ `useI18n` calls. Replace translation lookups with the supplied strings.
- Preserve language sorting, navigation to the selected locale’s landing page, local storage behavior, game creation requests, and game navigation.
- Do not wrap the landing page in a translation provider or pass its full dictionaries through props.

### Combined lobby/game translations

Make the game route layout async:

1. Await its existing route params and validate `lang`.
2. Load `getGameDictionary(lang)`.
3. Wrap **both `GameHeader` and `children`** in the existing `I18nProvider`, passing `locale` and this dictionary.

Keep the provider’s filename, exported names, and `{ locale, dictionary, t }` interface to minimize changes. Change its dictionary type to `GameDictionary` and document that it serves the game route.

Preserve existing dotted lookup, interpolation, missing-key fallback, and missing-provider error behavior. Do not add generic providers, namespace merging, browser dictionary fetching, or a translation dependency.

The existing game page, Suspense boundary, `GamePageContent` existence check, and error handling remain in place. Its hardcoded “Loading table” label is outside this refactor.

Lobby, table, history, feed, cards, and errors remain one dictionary because they share the same route and transition without navigation.

### Remove implicit English client dependencies

In `components/poker/view-model.ts`, replace runtime dictionary imports with `GameDictionary` type-only imports.

Make localized arguments explicit, preserving argument order:

```ts
feedEventLabel(event, locale, labels)
cardLabel(card, labels)
describeHandResult(winnerNames, labels)
describeSeatStatus(player, latestAction, labels, actions, locale)
formatActionLabel(action, locale, labels)
```

Remove defaults from these arguments. Pass `null` explicitly when no latest action exists. Keep `formatChips`’ existing default locale; it does not import translations.

Existing production callers in `ActionFeedPanel`, `PlayingCard`, and `Seat` already supply their translation sections. Update any affected calls, including internal helper calls. Update view-model tests to import English game fixtures explicitly and supply their arguments.

### Future pages and documentation

Add contributor guidance covering:

- Where each dictionary belongs and how to add keys/locales.
- Server Components load dictionaries directly.
- Client Components receive narrow props or a route-scoped provider.
- Never import dictionary values from client components or shared client utilities.
- For a future About page, add `dictionaries/about-server/<locale>.ts` and a server-only loader; render its content directly. Do not register it in a root provider or game dictionary.
- A future shared interactive component receives its own narrow strings through props.

Update the relevant guidance in README, CONTRIBUTING, and AGENTS without unrelated rewriting. Do not implement About, translate developers content, or change public HTTP APIs, persistence, or poker behavior.

## Verification and handoff requirements

Use Node 24 or newer. If dependencies are missing, install with `npm ci`.

Before editing Next.js components, read the installed guides required by AGENTS:

- `node_modules/next/dist/docs/01-app/02-guides/internationalization.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`

The installed version is Next.js 16.3.5 with `cacheComponents: true`; preserve the existing async params and caching conventions.

Add or update focused tests:

- For every dictionary group and locale, compare all leaf-key paths and interpolation placeholders against English. Existing placeholder-only checks do not catch missing strings without placeholders.
- Preserve landing copy checks for the engine link label, TypeSafe, and OpenRouter.
- Test landing rendering and client-boundary props in English and Finnish: the selector receives one string; the form receives four; neither receives server prose or game sections.
- Test that the locale layout renders children without a translation provider.
- Test that the game layout supplies the selected locale’s game dictionary to a provider covering both header and content, with no metadata or landing keys.
- Preserve the unknown-game `notFound` test.
- Update view-model tests to supply English labels; add non-English coverage for card labels, seat status, feed messages, and formatted amounts to catch accidental English fallback.
- Cover interpolation and missing-provider behavior after narrowing the provider type.

Run:

```sh
npm run check
npm run build
```

Vitest already aliases `server-only` to a test stub. Unit tests must not require Supabase or external inference. CI’s placeholder environment values are available in `.github/workflows/ci.yml`; use that setup for an isolated production build.

After building, inspect client JavaScript under the configured build directory’s `static/chunks` for distinctive landing prose and dictionary objects. These must not be bundled. Verify boundary props through the tests above; **do not require server-rendered text to be absent from HTML/RSC**.

Smoke-check English and Finnish landing pages, language selection, and the developers route. When local Supabase is available, also check creating a table, lobby-to-game transition, and localized history/feed. The existing Playwright configuration requires local Supabase, so it is not a prerequisite for isolated translation tests.

Deliver a single coherent refactor with passing required checks and documented boundaries. No new dependency, migration, URL change, or About implementation is needed.
