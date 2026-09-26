# Plan: Decompose PokerApp.tsx

`PokerApp.tsx` is ~900 lines mixing eight concerns: DTO declarations, pure formatting helpers, six inline sub-components, all fetch mutations, realtime wiring, AI auto-advance orchestration, and three separate JSX branches. Split it into a thin container + presentational components + one data hook + pure view-model helpers, with **zero** behavior, DOM, or text changes.

## Steps

### Phase 1 — Types + pure helpers

1. Create `components/poker/types.ts` — alias `LegalAction`, `PublicPokerPlayer`, `PublicPokerGame` from `lib/poker/types.ts` instead of redeclaring them; keep `Game`, `AIDecision`, `HandHistory`, `HandActionHistoryItem`, `CompletedAIDecisionInspection` locally (no server equivalent).
2. Create `components/poker/view-model.ts` — move `formatChips`, `cardLabel`, `arrangeSeats`, `parseProbabilities`, plus extract the logic currently buried in JSX IIFEs: `resolveViewer`, `canManageTable` (duplicated 3×), `filledSeatCount`, `describeHandResult`, `describeSeatStatus` (the nested ternary in `Seat`), `availableHistoryHands`.
3. Replace `parseProbabilities`'s `as Record<string, unknown>` with a guarded narrowing (AGENTS.md forbids unchecked assertions).
4. Add `components/poker/view-model.test.ts` — `arrangeSeats` at 2/3/5/6 seats, split-pot result, host/no-host permissions, `describeSeatStatus` precedence, `parseProbabilities` on junk input.

### Phase 2 — Shared client utils (parallel with Phase 1)

5. `lib/http/request-json.ts` — lift `requestJson<T>`, keeping the same error-message extraction.
6. `lib/identity/player-token-client.ts` — lift `getClientPlayerToken()`; `lib/identity/player-token.ts` is server-side (next/headers), so the `ai-holdem-player-id` cookie name needs a guarded single source.

### Phase 3 — `useGameSession` hook (depends on 1–2)

7. Owns `game`/`loading`/`error`/`liveDecisions`/`history`/`selectedHistoryHand`, the `automaticallyAdvancedVersions` ref, both load effects with their `cancelled` guards, `useGameChannel`, and the `useEffectEvent` AI auto-advance logic — preserved exactly.
8. Exposes `createGame`, `loadGame`, `claimSeatAt`, `releaseSeat`, `assignBot`, `startWaitingGame`, `updateSeatCount`, `submitAction`, `beginNextHand`, `selectHistoryHand`. Every `expectedVersion: game.version` payload and setLoading/setError/finally shape must survive untouched.
9. Player-name localStorage state stays in the component tree (LobbyPanel input), not the hook.

### Phase 4 — Presentational split (depends on 3; 10–15 mutually parallel)

10. `PlayingCard.tsx` — move verbatim (`card`, `hidden` props).
11. `Seat.tsx` — move verbatim; use `describeSeatStatus`.
12. `ActionHistory.tsx` — `ActionHistory` + `DecisionSummary`, props unchanged.
13. `HistoryModal.tsx` — the `role="dialog"` wrapper + backdrop + close button.
14. `LobbyPanel.tsx` — the whole `waiting` branch; owns the name input + localStorage; the three IIFEs become `canManageTable` / `filledSeatCount` calls.
15. `PokerTable.tsx` (table-meta, seat rows, center-table, community cards, hand result) and `ActionTray.tsx` (spectator CTA, stand-up, legal-action buttons, amount control — owns the `amount` state).
16. `PokerApp.tsx` becomes a ~120-line container: hook → viewer derivations → loading/waiting/no-human/table branches.

## Target file layout

```
components/poker/
  PokerApp.tsx            container: ~120 lines, wires hook -> views
  AppHeader.tsx           (unchanged)
  types.ts
  view-model.ts
  view-model.test.ts
  PlayingCard.tsx
  Seat.tsx
  LobbyPanel.tsx
  PokerTable.tsx
  ActionTray.tsx
  ActionHistory.tsx
  HistoryModal.tsx
  useGameSession.ts
lib/http/request-json.ts
lib/identity/player-token-client.ts
```

## Relevant files

- `components/poker/PokerApp.tsx` — source of every extraction; ends as the container.
- `components/poker/AppHeader.tsx` — the presentational convention to imitate (~46 lines, dumb component).
- `lib/poker/types.ts` — `PublicPokerGame` / `PublicPokerPlayer` / `LegalAction`, isomorphic (safe to import client-side).
- `lib/poker/game-service.ts`, `lib/supabase/queries.ts` — import `server-only`; never reachable from a client file.
- `lib/realtime/useGameChannel.ts` — `(gameId, currentVersion, onUpdate)`.
- `lib/identity/player-token.ts` — cookie name source of truth.
- `app/game/[gameId]/page.tsx` — server component rendering `<PokerApp gameId={...} />`; `app/page.tsx` does NOT use PokerApp.
- `app/globals.css` — global CSS; all class names already defined, so splitting files is CSS-safe.
- `test/e2e/lobby.spec.ts` — the literal-text contract.

## Verification

1. `npm run check` (eslint + strict tsc + vitest) after each phase.
2. `npx vitest run components/poker/view-model.test.ts` for the new unit tests.
3. `npx playwright test test/e2e/lobby.spec.ts` — the real regression gate. It asserts exact strings: `"WAITING ROOM"`, `"Sit here"`, `"Start hand"`, `"Open seat"`, `"Your legal actions"`, plus data-driven `"PREFLOP"`, `"PLAYER 2"`, `/Call/`. These must be emitted verbatim.
4. `npm run build` — PokerApp is reached from a server component; the build fails loudly if a `server-only` module leaks into the client graph.
5. Manual: create game → host changes seat count → assign bot → sit → start hand → play to showdown with AI auto-advance → History modal hand switching → stand up → second browser profile for spectator view + realtime refetch.
6. Confirm spectators still get `holeCards === null` rendered as card backs (privacy boundary), and no `playerToken` rendering changed.

## Decisions

- Pure refactor — no visual, text, DOM, or API changes; `PokerApp`'s `{ gameId?: string }` prop stays.
- No CSS modules migration; `globals.css` stays global.
- No state-management library and no context provider — props + one hook suffices at this size.
- Files stay flat in `components/poker/`. `app/page.tsx`'s duplicated game-creation lobby is out of scope.
- `eslint.config.mjs` is stock `next/core-web-vitals` + `typescript` with no `max-lines` or complexity rules, so nothing blocks the split.

## Further Considerations

1. **Shared types**: alias `lib/poker/types.ts` (single source of truth, module is server-free today) vs. keep client-local copies (immune to accidental server imports). _Recommend aliasing, with a comment or test guarding that the module stays server-free._
2. **Hook granularity**: one `useGameSession` vs. `useGameSession` + `useHandHistory` + `useAiAutoAdvance`. _Recommend one; split only if it passes ~200 lines._
3. **Component tests**: add 2 RTL tests (lobby host controls, action tray legal buttons) while extracting, or rely solely on Playwright? _Recommend adding them — there is zero component-level coverage today._
