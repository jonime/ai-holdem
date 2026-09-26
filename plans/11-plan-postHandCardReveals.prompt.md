## Plan: Post-Hand Card Reveals

Implement poker-correct showdown disclosure plus optional post-hand showing. At showdown, every non-folded player’s cards become public and folded cards remain hidden. On fold-ended hands, any human participant may explicitly show their own cards via the right action button or `D`; bots show an uncontested winning hand only when the host enabled the pre-game lobby option, which defaults off. Bot showing is policy-driven, not a new TypeSafe decision.

**Steps**

### Phase 1: Persistence and atomicity

1. Add a new migration after `20260928000000_add_game_hosts.sql` (suggested `20260929000000_add_card_reveals.sql`) that:
   - Adds `games.bots_show_uncontested_wins boolean not null default false`.
   - Adds `hand_card_reveals` keyed uniquely by `(hand_id, player_id)`, with foreign keys to `hands` and `game_players`, a constrained reason such as `voluntary` or `bot_uncontested`, and a timestamp. Do not record mandatory showdown disclosure because it is derivable from final hand state.
   - Grants only the service role the required table access.
   - Replaces `update_table_settings_if_version` to accept and persist the boolean in the same host-authorized, waiting-game settings flow; include the new games column in explicit `returns setof games` projections.
   - Replaces both `apply_human_action_if_version` and `apply_ai_action_if_version` with an optional auto-reveal player engine ID/reason input. In the same CTE transaction that completes the hand, insert the reveal only when the service identified a fold-ended bot winner and the stored game setting is enabled. This covers hands completed by either a human or AI action and makes the result visible immediately.
   - Adds `reveal_human_cards_if_version(game, hand, expected version, player token)` that locks the game, verifies the hand is the current completed fold-ended hand and the token owns a human seat, then inserts the reveal and increments the game version atomically. If that same player/hand reveal already exists, return the current game without another insert or version bump (safe retry); otherwise a stale version or different hand must conflict.
2. Extend repository parsing and interfaces in `/Users/joni/Workspace/ai-holdem/lib/supabase/queries.ts`:
   - Parse and expose `botsShowUncontestedWins` on persisted games.
   - Pass the setting through the existing table-settings RPC.
   - Pass the optional bot auto-reveal ID through both action persistence methods.
   - Add the versioned human reveal RPC method.
   - Add a current-hand reveal reader that resolves reveal rows back to engine player IDs for projection.
3. Update `/Users/joni/Workspace/ai-holdem/lib/supabase/queries.test.ts` with exact RPC argument, row parsing, idempotent success, and conflict/error tests. This phase blocks all later phases.

### Phase 2: Rules, projection, and services

4. Extend `/Users/joni/Workspace/ai-holdem/lib/poker/types.ts` and `/Users/joni/Workspace/ai-holdem/components/poker/types.ts` with:
   - `botsShowUncontestedWins` in the existing `TableSettings`/public game settings surface.
   - A public per-player `cardsRevealed` boolean so the owner UI can distinguish private self-visibility from cards already shown publicly.
5. Update `pokerEngineAdapter.publicProjection` in `/Users/joni/Workspace/ai-holdem/lib/poker/adapter.ts` to accept the current hand’s voluntarily/automatically revealed engine player IDs and apply one centralized visibility rule:
   - The viewer always sees their own cards privately.
   - During an active hand, everyone else remains masked.
   - At a completed showdown, all non-folded players are public; folded players stay masked.
   - At a fold completion, only IDs in `hand_card_reveals` are public.
   - `cardsRevealed` reports public disclosure, not private self-visibility.
6. Add focused adapter tests in `/Users/joni/Workspace/ai-holdem/lib/poker/adapter.test.ts` for showdown non-folded disclosure, folded-card privacy, fold-ended default privacy, explicit reveal, spectator visibility, and the distinction between own private cards and `cardsRevealed`.
7. Centralize public-game construction in `/Users/joni/Workspace/ai-holdem/lib/poker/game-service.ts` so `getPublicGame` and every mutation response load/pass current-hand reveal IDs consistently alongside open-seat placeholders. Extend `updateTableSettings` with the new boolean and preserve host-only/waiting-only checks.
8. In `submitHumanAction` and `stepTypesafeAction`, after applying an action, inspect the adapter snapshot. Only when `completionReason === "fold"`, the configured toggle is on, and the sole winner’s seat controller is `typesafe_ai`, pass that winner ID to the corresponding atomic action RPC. Showdown needs no reveal record.
9. Add `revealHumanCards` in the game service. Validate current completed hand, `completionReason === "fold"`, caller token ownership, human controller, and that the player was dealt hole cards; invoke the versioned repository mutation and return the caller-specific projection. Permit both the folded human and the uncontested human winner to show.
10. Expand `/Users/joni/Workspace/ai-holdem/lib/poker/game-service.test.ts` for both action paths that can auto-show a bot, toggle-off behavior, human winner behavior, showdown behavior, human reveal authorization, folded-human reveal, winner reveal, stale version/hand, active-hand rejection, bot/spectator rejection, and idempotency.

### Phase 3: HTTP, schemas, and Realtime

11. Update `/Users/joni/Workspace/ai-holdem/lib/http/schemas.ts` for `botsShowUncontestedWins` and `cardsRevealed`. Keep public card faces schema-valid while preserving the stricter broadcast schema.
12. Extend `/Users/joni/Workspace/ai-holdem/app/api/games/[gameId]/settings/route.ts` and its test to parse the required boolean with the other table settings and map validation, authorization, waiting-state, and version conflicts consistently.
13. Add `/Users/joni/Workspace/ai-holdem/app/api/games/[gameId]/reveal/route.ts` plus `route.test.ts`. Accept `{ expectedVersion, handNumber }`, obtain the player token using the existing identity helper, call `revealHumanCards`, return `{ game }`, and map malformed input, unauthorized/nonparticipant, invalid hand state, missing game, and version conflict to established status patterns.
14. After a successful reveal, publish a sanitized `cards_revealed` wake-up event using `/Users/joni/Workspace/ai-holdem/lib/realtime/publish.ts`. Continue masking all `holeCards` and player tokens in Broadcast; other clients learn card faces only by refetching authoritative HTTP state. Add/update `/Users/joni/Workspace/ai-holdem/lib/realtime/publish.test.ts` and the route tests to prove this privacy boundary. Existing `hand_completed` events cover automatic bot disclosure because it is committed with the completing action.

### Phase 4: Lobby and table UI

15. Extend the existing settings draft in `/Users/joni/Workspace/ai-holdem/components/poker/LobbyPanel.tsx` with a checkbox/toggle labeled “Bots show uncontested wins.” It is visible with lobby settings, editable only by the host before play, defaults from server state (false for new games), and saves through the existing settings submit rather than a new settings endpoint/component.
16. Extend `updateTableSettings` in `/Users/joni/Workspace/ai-holdem/components/poker/useGameSession.ts` for the setting. Add `revealCards()` posting the current `expectedVersion` and `handNumber`, replacing local game state with the private response; normal Realtime refetch updates other viewers.
17. Update `/Users/joni/Workspace/ai-holdem/components/poker/PokerTable.tsx` so the right action slot changes from Bet/Raise to Show only for a completed fold-ended hand. Enable it when the viewer owns a human seat that was dealt cards and `cardsRevealed` is false; disable/remove it after disclosure. Leave the center Next Hand control unchanged.
18. Update `/Users/joni/Workspace/ai-holdem/components/poker/PokerApp.tsx` so `D` invokes the exact same Show callback/eligibility as the button after a fold-ended hand, while retaining Bet/Raise behavior during an active human turn. Existing loading, modal, editable-target, modifier, and repeat guards remain in force.
19. Add localized labels, descriptions, status/error text in all dictionaries under `/Users/joni/Workspace/ai-holdem/lib/i18n/dictionaries/`: `en-US.ts`, `de-DE.ts`, `es-ES.ts`, `fi-FI.ts`, and `sv-SE.ts`. Reuse the current dictionary typing so missing translations fail type checking.
20. Add focused frontend tests in `/Users/joni/Workspace/ai-holdem/components/poker/view-model.test.ts` or a nearby component test surface for Show eligibility: folded participant, uncontested winner, spectator/bot, active hand, showdown, and already revealed. Cover `D` retaining bet behavior in-hand and invoking Show only in the completed-fold context where the existing test setup permits.

### Phase 5: End-to-end verification

21. Update `/Users/joni/Workspace/ai-holdem/test/e2e/lobby.spec.ts` or add a focused reveal spec to cover: default-off lobby state; host saves on; showdown shows every non-folded hand but not folded cards; human folds then uses Show/D and another browser sees the cards after Realtime refetch; bot wins by folds with toggle off/on; next hand restores privacy.
22. Before coding against Next.js route APIs, read the applicable installed guides under `/Users/joni/Workspace/ai-holdem/node_modules/next/dist/docs/` as required by `AGENTS.md`.

**Relevant files**

- `/Users/joni/Workspace/ai-holdem/supabase/migrations/20260929000000_add_card_reveals.sql` — new setting, reveal records, updated action/settings RPCs, and human reveal RPC.
- `/Users/joni/Workspace/ai-holdem/lib/poker/adapter.ts` — authoritative public card visibility rule.
- `/Users/joni/Workspace/ai-holdem/lib/poker/game-service.ts` — auto-show policy, human Show validation, and consistent projection.
- `/Users/joni/Workspace/ai-holdem/lib/supabase/queries.ts` — persisted setting/reveal queries and RPC contracts.
- `/Users/joni/Workspace/ai-holdem/app/api/games/[gameId]/reveal/route.ts` — versioned human Show boundary.
- `/Users/joni/Workspace/ai-holdem/app/api/games/[gameId]/settings/route.ts` — existing host lobby settings boundary.
- `/Users/joni/Workspace/ai-holdem/components/poker/LobbyPanel.tsx` — host toggle.
- `/Users/joni/Workspace/ai-holdem/components/poker/PokerTable.tsx` — right-button Show state.
- `/Users/joni/Workspace/ai-holdem/components/poker/PokerApp.tsx` — context-sensitive `D` shortcut.
- `/Users/joni/Workspace/ai-holdem/components/poker/useGameSession.ts` — reveal/settings mutations.

**Verification**

1. Run focused Vitest files after each phase: adapter, repository, game service, route, Realtime, and view-model/component tests.
2. Run `npm run check` after implementation. If the known generated `.next-e2e` lint or Playwright/Vitest overlap recurs, also report focused ESLint plus `npx vitest run --exclude 'test/e2e/**'` results rather than treating generated failures as feature regressions.
3. Run `npm run build` because routes, DTO schemas, and rendering behavior change.
4. Run the Playwright reveal scenarios only with approval/awareness that global setup executes `supabase db reset --local --yes`; verify desktop and mobile layouts, the Show button/right action slot, and two-browser disclosure/refetch behavior.
5. Manually inspect HTTP and Realtime payloads: HTTP exposes only own or publicly disclosed hole cards; Broadcast always has `holeCards: null`; folded showdown cards never leak; starting the next hand remasks all opponents.

**Decisions**

- “Bots show uncontested wins” defaults OFF and is host-editable only in the pre-game lobby.
- Mandatory showdown disclosure is unconditional and independent of the lobby toggle.
- Folded cards never reveal automatically, including at showdown.
- Any human participant dealt into a fold-ended hand may voluntarily reveal, whether they folded or won.
- Bots never make a post-hand TypeSafe reveal decision. With the option off they never voluntarily show; with it on only an uncontested bot winner shows.
- Spectators see the same publicly disclosed cards as players through authoritative HTTP refetch.
- Reveal records remain attached to completed hands for audit/future replay, but adding card display to the existing history modal is outside this feature.
- No mid-hand showing, selective one-card showing, reveal animation, or new AI prompt/state phase is included.
