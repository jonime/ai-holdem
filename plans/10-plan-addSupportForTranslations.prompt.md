## Plan: Next.js Translation Support

Add an English-first localization scaffold using the official Next.js App Router internationalization pattern: canonical locale-prefixed URLs (`/en-US`, `/en-US/game/:gameId`), a root `[lang]` segment, `proxy.ts` redirects based on supported locales, and server-loaded dictionaries. Keep API routes unprefixed and keep Postgres/RPC errors out of the first translation pass.

**Steps**

1. Establish i18n primitives.
   - Add a small `lib/i18n/` module with `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `Locale`, `hasLocale`, and path helpers for adding/removing locale prefixes.
   - Add `lib/i18n/dictionaries/en-US.ts` or `.json` as the first dictionary. Use nested keys grouped by surface: metadata, home, gameHeader, lobby, table, seat, history, cards, errors, actions.
   - Add a server-only `getDictionary(locale)` loader. Since only `en-US` is planned initially, keep this dependency-free; when a second locale is added, wire browser negotiation with `@formatjs/intl-localematcher` and `negotiator` as shown by the installed Next docs.

2. Add canonical locale routing.
   - Add root `proxy.ts` using Next 16’s Proxy convention, not deprecated `middleware.ts`.
   - Redirect locale-less page routes to `/en-US/...`, preserving the pathname and search params.
   - Exclude `/api`, `/_next`, image optimization/static asset paths, and public files such as `/manifest.webmanifest` and `/ai-holdem-logo.png` from locale redirects.
   - Treat unsupported locale prefixes as normal app routes that will 404 from the `[lang]` layout.

3. Move App Router pages under `[lang]`.
   - Move the current root UI route from `app/page.tsx` to `app/[lang]/page.tsx`.
   - Move `app/game/[gameId]/layout.tsx`, `page.tsx`, `GamePageContent.tsx`, and `page.test.tsx` under `app/[lang]/game/[gameId]/`.
   - Move the root layout behavior into `app/[lang]/layout.tsx`, validate `params.lang` with `hasLocale`, set `<html lang={lang}>`, load the dictionary, and provide it to descendants.
   - Keep `app/api/**` where it is, so fetches continue to use `/api/...`.
   - Leave a minimal root `app/layout.tsx` only if required by Next after moving the root layout under `[lang]`; otherwise let `[lang]/layout.tsx` be the root layout as described in the Next docs.

4. Localize server-rendered metadata and home page.
   - Replace static `metadata` in `app/layout.tsx` with locale-aware `generateMetadata` in the `[lang]` layout.
   - Translate title/description/open graph/twitter strings from the dictionary.
   - Update `app/[lang]/page.tsx` to use dictionary strings for the start-game region label, logo alt text, intro copy, and bot/source attribution text.

5. Add a client translation provider.
   - Create a small client-side provider/hook, for example `components/poker/I18nProvider.tsx` or `lib/i18n/client.tsx`, that receives the already-loaded dictionary and locale from the server layout.
   - Prefer a typed `t(key, values?)` helper or grouped dictionary access over ad hoc string literals. Include simple interpolation for values such as seat numbers, counts, percentages, chip amounts, player names, and hand numbers.
   - Keep dictionaries serializable so they can cross the Server Component to Client Component boundary cleanly.

6. Update navigation and URL creation.
   - Update `components/poker/NewGameForm.tsx` so `router.push` sends users to `/${locale}/game/${gameId}` after creation.
   - Update `components/poker/useGameSession.ts` and/or callers so any navigation to game pages preserves the current locale, while API fetches remain locale-neutral.
   - Update `components/poker/GameHeader.tsx` so Exit navigates to `/${locale}` instead of `/`, and translate the confirm prompt and button label.
   - Keep stored game IDs and player names unchanged; they are data, not locale-specific UI.

7. Extract client UI strings.
   - Translate visible labels, buttons, placeholders, aria labels, and empty/loading states in `NewGameForm`, `LobbyPanel`, `PokerTable`, `Seat`, `PlayingCard`, `HistoryModal`, and `ActionHistory`.
   - Translate action labels and status strings currently generated in `components/poker/view-model.ts`: `describeSeatStatus`, `describeHandResult`, and `formatActionLabel`.
   - Avoid translating user data, bot names, raw AI decision JSON, card rank/suit symbols, or poker-engine enum values stored in persisted history.

8. Localize formatters without changing game data.
   - Change `formatChips(value)` to accept a `Locale` or formatter argument, then use `Intl.NumberFormat(locale)`.
   - Change `cardLabel(card)` to accept localized suit names from the dictionary for accessible labels.
   - Update components/tests that call these helpers to pass locale or use a locale-aware wrapper from the i18n provider.

9. Handle client-facing errors conservatively.
   - Translate client fallback errors in `useGameSession.ts` and `NewGameForm.tsx`.
   - Leave server/API/service error message strings English in the first pass unless they are already surfaced through fallback UI. Do not edit existing migrations or RPC error text.
   - Document a later error-code pass if fully localized server validation errors become a requirement.

10. Update tests and selectors.

- Update App Router route tests under `app/[lang]/game/[gameId]/page.test.tsx` for the new params shape.
- Update `components/poker/view-model.test.ts` for locale-aware formatter/status functions.
- Update `test/e2e/lobby.spec.ts` to start at `/en-US` and expect `/en-US/game/:gameId`; keep tests English for this scaffold.
- Where tests are brittle because they assert incidental translated copy, prefer semantic roles/labels tied to dictionary values or stable selectors only where role-based selection is impractical.

11. Validate and polish.

- Run `npm run typecheck` after route moves because `next typegen` must regenerate `LayoutProps`/`PageProps` types for `[lang]` paths.
- Run focused Vitest files for changed helpers/components, then `npm run check`.
- Run `npm run build` because this changes routing, metadata, and Proxy behavior.
- Smoke test `http://localhost:3001/` redirects to `/en-US`, `/en-US/game/:id` loads, and `/api/games` is not redirected.

**Relevant files**

- `/Users/joni/Workspace/ai-holdem/node_modules/next/dist/docs/01-app/02-guides/internationalization.md` — official App Router guidance: use locale-prefixed routing via Proxy and nest special files under `app/[lang]`.
- `/Users/joni/Workspace/ai-holdem/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` — Next 16 file convention; use `proxy.ts`, not `middleware.ts`.
- `/Users/joni/Workspace/ai-holdem/app/layout.tsx` — current root metadata, font setup, and hardcoded `lang="en"`.
- `/Users/joni/Workspace/ai-holdem/app/page.tsx` — home page copy and start-game region.
- `/Users/joni/Workspace/ai-holdem/app/game/[gameId]/layout.tsx` — game header wrapper to move under `[lang]`.
- `/Users/joni/Workspace/ai-holdem/app/game/[gameId]/page.tsx` — game route shell to move under `[lang]` and retarget params.
- `/Users/joni/Workspace/ai-holdem/app/game/[gameId]/GamePageContent.tsx` — game existence check before rendering `PokerApp`.
- `/Users/joni/Workspace/ai-holdem/components/poker/NewGameForm.tsx` — create-game UI strings and locale-aware navigation after POST `/api/games`.
- `/Users/joni/Workspace/ai-holdem/components/poker/PokerApp.tsx` — client shell that should receive/use locale dictionary context.
- `/Users/joni/Workspace/ai-holdem/components/poker/useGameSession.ts` — client fallback errors and game navigation behavior.
- `/Users/joni/Workspace/ai-holdem/components/poker/LobbyPanel.tsx` — largest lobby translation surface.
- `/Users/joni/Workspace/ai-holdem/components/poker/PokerTable.tsx` — table metadata, action controls, bet sizing labels.
- `/Users/joni/Workspace/ai-holdem/components/poker/Seat.tsx` — seat status, role titles, winner badges, chip formatting.
- `/Users/joni/Workspace/ai-holdem/components/poker/ActionHistory.tsx` — history headings, selectors, confidence/raw-data labels.
- `/Users/joni/Workspace/ai-holdem/components/poker/HistoryModal.tsx` — dialog and close aria labels.
- `/Users/joni/Workspace/ai-holdem/components/poker/PlayingCard.tsx` — hidden-card label and localized card aria labels.
- `/Users/joni/Workspace/ai-holdem/components/poker/view-model.ts` — formatter/status/result/action label helpers.
- `/Users/joni/Workspace/ai-holdem/test/e2e/lobby.spec.ts` — exact English text assertions and URL expectations.

**Verification**

1. `npm run typecheck` to regenerate and validate Next route helper types after the `[lang]` move.
2. `npm test -- components/poker/view-model.test.ts app/[lang]/game/[gameId]/page.test.tsx` for localized helper and route behavior.
3. `npm run check` for lint, typecheck, and full Vitest coverage.
4. `npm run build` because route structure, metadata, and Proxy behavior change.
5. Manual/browser smoke tests: `/` redirects to `/en-US`; `/game/<id>` redirects to `/en-US/game/<id>`; `/en-US` can create a game; `/en-US/game/<id>` loads and navigates Exit back to `/en-US`; `/api/games` is still reachable without a locale prefix.

**Decisions**

- First implementation supports `en-US` only, as an i18n scaffold ready for additional locales.
- Canonical user-facing URLs are locale-prefixed, including the default locale: `/en-US` and `/en-US/game/:gameId`.
- Use the official Next.js App Router pattern from the installed docs rather than adding `next-intl` for the initial scaffold.
- API routes remain unlocalized and unprefixed.
- Database/RPC and raw backend/service error strings are excluded from this first pass; translate client fallback errors now and consider server error codes later.

**Further Considerations**

1. Add the second locale as a follow-up by adding a dictionary file, enabling Accept-Language matching dependencies, and running the existing e2e flow once per locale or for the default plus one translated smoke path.
2. If translated pluralization becomes important, consider introducing ICU-style message formatting before adding many locales, rather than inventing custom plural rules.
3. If SEO matters beyond the demo, add localized alternates/canonical metadata once more than one locale exists.
