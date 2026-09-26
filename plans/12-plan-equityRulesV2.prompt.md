## Plan: Equity Rules v2

Replace the simplistic current equity bot with one user-visible, deterministic non-LLM option named **Equity Rules v2**. The new bot will combine seeded showdown equity with explicit preflop hand features, postflop made-hand/draw and board-texture analysis, opponent pressure inferred from action history, SPR-aware action/sizing rules, and deterministic mixed frequencies. Keep `basic-equity-v1` and its implementation as a hidden legacy resolver so active games and historical metadata retain their original semantics. Extend the existing difficulty flow so `rules` bots, like TypeSafe bots, persist and display easy/medium/hard profiles.

**Steps**

### Phase 1: Pure poker analysis

1. Add `lib/bots/equity-rules/hand-analysis.ts` with small typed, pure helpers that parse the existing two-character card format through `@hivetech/poker-engine` APIs and derive only defensible features:
   - canonical preflop features/tier from ranks, pair, suitedness, and gap/connectivity;
   - postflop made-hand category using `evaluateHand` for the 5-7 hero-plus-board cards;
   - flush-draw, open-ended/gutshot, overcard, and combo-draw flags without double-counting them as precise outs;
   - board pairing, suit concentration, and rank connectivity, summarized as dry/neutral/wet texture.
     Keep Monte Carlo `showdownEquity` authoritative as the numeric equity baseline; these features modulate ranges, aggression, and sizing rather than replacing it.
2. Add `lib/bots/equity-rules/hand-analysis.test.ts` with table-driven coverage for representative preflop classes, wheel and duplicate-rank straight cases, made hands, flush/straight draws, paired/monotone/connected boards, and malformed/edge inputs. Use the installed engine's `parseCard`/`evaluateHand` instead of introducing a poker dependency or duplicating hand ranking.

### Phase 2: Deterministic strategy engine

3. Add `lib/bots/equity-rules/strategy.ts` with typed `easy`, `medium`, and `hard` profiles. Profiles should vary skill in explainable ways: easy has wider safety margins, no pure bluffs, simpler/smaller value sizing; medium adds selective semi-bluffs and pressure adjustments; hard uses tighter threshold calibration, wider value, deterministic mixed bluffs in suitable low-pressure spots, and more SPR/texture-aware sizing. Do not model higher difficulty as merely “always looser.”
4. In the same strategy module, derive a coarse opponent range/pressure signal from actions made by IDs in `context.opponents`: distinguish preflop raises and current-street bets/raises, weight later-street and repeated aggression more heavily, and never infer unavailable bet-to-pot ratios because action history lacks pot-at-action. Convert that signal into transparent call/value/bluff threshold adjustments rather than reporting a fabricated adjusted equity.
5. Implement a stable hash-to-unit-interval helper over hand number, hero cards, board, street, and action history. Use it only for configured semi-bluff/pure-bluff frequencies so identical state always returns an identical action. Pure bluffs must require a legal aggression action, no current opponent pressure, suitable board/hand features, and profile permission; easy remains bluff-free.
6. Implement legal-action-first decision order in `strategy.ts`:
   - detect whether the bot is opening/checking or facing a wager;
   - handle low-SPR strong-value all-ins conservatively;
   - choose value bet/raise from equity, made-hand strength, pressure, street, and profile thresholds;
   - choose semi-bluffs from real draw flags and deterministic frequency;
   - call only when equity clears pot odds plus the profile/pressure margin;
   - use selected pure bluffs only in eligible unopened pots;
   - check whenever checking is legal and no aggression rule wins; otherwise fold.
     Every returned action must be copied from or bounded by `legalActions`/`sizingOptions` so the poker engine remains the final legality authority.
7. Add sizing selection that prefers existing `SizingChoice` values: one-third for dry-board/thin-value or bluff spots, one-half as baseline, two-thirds/full-pot for wet-board strong value, and all-in only for strong value at low SPR. Fall back through an ordered choice list when shared sizing options were clamped/deduplicated; never calculate an unconstrained amount in the bot.
8. Add `lib/bots/equity-rules/strategy.test.ts` with focused scenario matrices for each street, position, pressure tier, draw type, SPR band, and difficulty. Include boundary tests around pot odds/value thresholds, short-stack clamping, “never fold when check is legal,” all legal-action subsets, deterministic repeatability, and observable easy/medium/hard differences. Favor representative rule coverage and invariants over hundreds of brittle combination snapshots.

### Phase 3: Bot and compatibility wiring

9. Add `lib/bots/equity-rules-v2.ts` implementing `PokerBot`: call the analyzer and strategy, return exactly one `PokerAction`, and record a stable `matchedRule` plus selected sizing metadata in `emptyDiagnostics`; keep `rawResponse: null`. Add `lib/bots/equity-rules-v2.test.ts` for end-to-end bot decisions and diagnostics across representative preflop, postflop, pressure, and difficulty contexts.
10. Update `lib/bots/registry.ts` to expose only `{ id: "equity-rules-v2", label: "Equity Rules v2", provider: "rules" }` in `getBotCatalog()`. Add an internal descriptor/resolution path for `basic-equity-v1` that still constructs `BasicEquityBot`; do not expose the old ID for new assignment and do not route old IDs through v2. Add `lib/bots/registry.test.ts` proving the catalog has exactly one `rules` option, both IDs resolve to their correct implementations, and unknown IDs still fail.
11. Preserve `lib/bots/basic-equity.ts` and `lib/bots/basic-equity.test.ts` unchanged except for any mechanical registry import/export adjustment. This keeps active v1 games behaviorally stable and historical `ai_decisions` truthful; no bot-ID data rewrite is required.

### Phase 4: Rules-bot difficulty persistence and UI

12. Add a new timestamped migration under `supabase/migrations/` (never edit the applied 20260930000000 migration): backfill existing `game_players` rows with `bot_provider = 'rules'` and null difficulty to `medium`, then replace `game_players_bot_matches_controller` so both `typesafe` and `rules` bots require a non-null valid difficulty while `openrouter` bots continue to require null. No RPC signature or historical `ai_decisions` update is needed.
13. Update `assignBotToSeat` in `lib/poker/game-service.ts` to preserve the requested difficulty for `typesafe` and `rules`, while leaving it null for OpenRouter. Centralize that provider capability check locally so the persisted assignment and returned assignment cannot diverge. Extend `lib/poker/game-service.test.ts` with rules-hard and OpenRouter-null cases; retain existing TypeSafe behavior.
14. Update `components/poker/LobbyPanel.tsx` to show the difficulty selector and persisted `label · difficulty` for both `typesafe` and `rules` providers, while keeping it hidden for OpenRouter. Prefer a small local capability predicate over duplicating provider conditions. No API shape change is needed because the assignment route already validates and forwards all three difficulty values.
15. Update `test/e2e/lobby.spec.ts` so the deterministic-bot flow selects `equity-rules-v2`, chooses a non-default difficulty, verifies `Equity Rules v2 · <difficulty>` survives reload, completes a hand, appears in history, and starts another hand. Keep the separate TypeSafe difficulty test to protect both provider paths.

### Phase 5: Documentation and validation

16. Update `README.md` to describe pluggable bots and explicitly identify Equity Rules v2 as the offline/non-LLM deterministic option; correct TypeSafe-only wording in the feature summary. Update `AGENTS.md` purpose/setup wording only where it currently implies all AI seats use TypeSafe, while preserving its architecture/security rules. `CONTRIBUTING.md` needs no change unless implementation alters a command or workflow.
17. Run focused validation after each phase: analyzer tests; strategy and bot tests; registry/service tests; then direct lint/typecheck on touched files. After integration, run `npm run check` and `npm run build` because the change affects persisted schema, client rendering, and server registry behavior. Apply the new migration to the local Supabase instance before the targeted Playwright lobby test; note that the documented E2E reset is destructive and should only run against the intended local database.
18. Perform a manual sanity pass in the lobby/game UI: verify exactly one `rules` bot appears, all three difficulty choices persist for it, OpenRouter has no difficulty control, a newly assigned v2 bot advances without external inference, and an existing `basic-equity-v1` fixture/state can still resolve and act.

**Relevant files**

- `/Users/joni/Workspace/ai-holdem/lib/bots/basic-equity.ts` — retain the legacy v1 strategy and semantics.
- `/Users/joni/Workspace/ai-holdem/lib/bots/equity-rules-v2.ts` — new `PokerBot` adapter and diagnostics.
- `/Users/joni/Workspace/ai-holdem/lib/bots/equity-rules/hand-analysis.ts` — preflop, made-hand, draw, and board features.
- `/Users/joni/Workspace/ai-holdem/lib/bots/equity-rules/strategy.ts` — profiles, pressure model, deterministic mixing, action selection, sizing.
- `/Users/joni/Workspace/ai-holdem/lib/bots/registry.ts` — one public rules descriptor plus hidden v1 resolution.
- `/Users/joni/Workspace/ai-holdem/lib/bots/types.ts` — reuse `BotContext`, `PokerBot`, and diagnostics contracts; change only if a shared internal type is genuinely required.
- `/Users/joni/Workspace/ai-holdem/lib/poker/ai-state.ts` — reuse seeded equity, pot odds, SPR, opponents, and action history; no state-contract expansion planned.
- `/Users/joni/Workspace/ai-holdem/lib/typesafe/questions.ts` — reuse `createSizingOptions` and `SizingChoice`; no sizing-contract change planned.
- `/Users/joni/Workspace/ai-holdem/lib/poker/game-service.ts` — persist difficulty for rules providers.
- `/Users/joni/Workspace/ai-holdem/components/poker/LobbyPanel.tsx` — expose/display rules difficulty.
- `/Users/joni/Workspace/ai-holdem/supabase/migrations/<new_timestamp>_enable_rules_bot_difficulty.sql` — backfill and update the assignment constraint.
- `/Users/joni/Workspace/ai-holdem/test/e2e/lobby.spec.ts` — v2 catalog, persistence, history, and hand-flow coverage.
- `/Users/joni/Workspace/ai-holdem/README.md` and `/Users/joni/Workspace/ai-holdem/AGENTS.md` — document the non-LLM option and current bot architecture.

**Verification**

1. `npx vitest run lib/bots/equity-rules/hand-analysis.test.ts`
2. `npx vitest run lib/bots/equity-rules/strategy.test.ts lib/bots/equity-rules-v2.test.ts`
3. `npx vitest run lib/bots/registry.test.ts lib/poker/game-service.test.ts`
4. Apply the new migration to the intended local Supabase database, then run the targeted deterministic-bot Playwright case in `test/e2e/lobby.spec.ts`.
5. `npm run check`
6. `npm run build`
7. Manually verify catalog uniqueness, difficulty persistence, offline v2 play, and hidden v1 compatibility.

**Decisions**

- Include the advanced heuristic scope selected by the user, but do not add a solver, external service, new dependency, persistent opponent model, or fabricated range-equity calculation.
- Rename/version the public option to `Equity Rules v2` / `equity-rules-v2`.
- Keep exactly one user-visible non-LLM option; retain `basic-equity-v1` only as an internal compatibility resolver with its original implementation.
- Support easy/medium/hard for rules bots and persist it in `game_players`; OpenRouter behavior remains unchanged.
- Keep decisions reproducible: seeded Monte Carlo equity plus stable state hashing, with no ambient randomness or I/O.
- Limit opponent modeling to the current hand's observable actions. Long-term player statistics, GTO claims, tournament ICM, and multi-table learning are out of scope.
