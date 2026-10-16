# Medium KK promotion review — 2026-10-16

Decision: recommend preparing the narrow medium-KK raise-to-3-BB change for
implementation and regression validation. The review itself did not deploy or change production strategy; the subsequent
implementation is recorded below. Hard QQ remains deferred. The [completed report](report-2026-10-16.md)
is the evidence for this decision.

## Evidence and boundary

Medium KK raise3 passed all three confirmation comparisons across 240 fresh
paired blocks. Against frozen Rules, the paired conditional difference was
+30.125 BB, with an adjusted 99.1667% bootstrap interval of +16.790 to +42.946 BB.
The passive and aggressive controls also had positive lower bounds. All 933
fixed decisions passed; the full study had zero excluded blocks. These are
conditional, reset-hand results against three heuristic opponent families.
They do not establish full-game performance or behavior at other stacks/positions.

Hard QQ call failed the frozen-Rules comparison: +12.960 BB with an interval of
−3.754 to +29.821 BB. Neither call nor the unconfirmed raise alternative should
be promoted for QQ.

Only replace a baseline fold when every tested condition holds:

- Medium difficulty and two kings.
- Preflop with no board, complete empty history and an unopened pot.
- Six participating seats: hero UTG and five active opponents.
- Hero has invested zero this street and has 100 BB remaining.
- Every opponent started with exactly 100 BB, reconstructing posted small/big
  blinds from their current stacks and positions.
- A raise to exactly three big blinds is engine-legal.

Existing baseline calls/raises and every other context retain the baseline
result. Do not change equity sampling, seed/hash construction, thresholds,
continuation policy, provider selection, context generation or persistence.

## Production fit

`lib/poker/bot-turn-service.ts` builds Rules context with projected complete/unknown
history, legacy decision history and legacy sizing options. It selects the
configured difficulty and calls `EquityRulesV2Bot`. `lib/poker/ai-state.ts` supplies
the relevant visible cards, position, statuses, remaining stacks, blind sizes,
investment and legal actions, with a default of 5,000 equity samples. The benchmark
has a regression test comparing its context to this same production constructor.
No new database query, schema field or private opponent cards are required.

Apply the override after computing the unchanged baseline decision. Keep the
logic in `lib/bots/` with production-owned types; never import a benchmark module
from production. Prefer the bot wrapper boundary so the underlying baseline
strategy remains directly available for differential tests. Return the exact
baseline object outside the guard. Use a fixed diagnostic rule identifier and
retain the ordinary sizing-diagnostic convention; never put cards into diagnostics.
The benchmark throws on an unexpectedly missing/out-of-bounds raise. Preserve
that visible invariant failure in the exact eligible domain, rather than silently
clamping to a different action or hiding an invalid candidate. The existing
engine validation and commit path remains authoritative.

The evidence covers four actual hand numbers (1, 2, 7 and 16), all six physical
KK combinations, one blind ratio and equal 100-BB roots. The tested guard does
not filter hand number or opponent controller. Applying that same guard in the
application is a deliberately limited policy decision based on this conditional
evidence; it is not additional evidence for arbitrary hand-number frequencies,
human opponents, other blind ratios or evolving-stack games. Broader strength
claims require a separately specified study.

## Implementation sequence

1. Preserve the completed baseline before editing any frozen source: save a
   durable Git snapshot or a verified source bundle of all 344 manifest files,
   with its revision/hash documented. Existing evidence and manifests must remain
   byte-identical. The current runner checks live `lib/` sources, so production
   edits intentionally invalidate reanalysis in that checkout. Reanalysis must
   use the preserved baseline checkout. Do not rewrite hashes to accept new code.
2. Add a production-owned fold-only guard and exact 3-BB override at the Rules
   bot boundary. Keep the existing strategy accessible as the unchanged baseline.
   Do not promote QQ or introduce broader premium-hand rules.
3. Add engine-backed tests using production context. Cover all six KK combinations
   and all four measured hand numbers at the 5,000-sample budget, checking equality
   with the archived candidate action and engine legality. Cover non-fold baseline
   decisions and reject changed difficulty/holding/position/player count, unequal
   stacks, short/all-in opponents, unknown/nonempty history and postflop states.
   Cover invalid raise bounds and sizing diagnostics. Compare unchanged outputs
   outside the guard, not merely action types.
4. Keep the frozen benchmark executing its original baseline in the preserved
   checkout. A candidate-to-production equivalence check belongs outside that
   frozen source set and must compare against the exact medium-KK raise3 policy.
   Do not rerun the costly confirmation experiment to obtain a different verdict.
5. Update the existing gameplay/architecture strategy guidance and benchmark index
   to distinguish the production policy from the historical study. Document the
   baseline revision and reanalysis location. Run the required check below; fix
   regressions without expanding the strategy scope.
6. Review the resulting diff and validation output before release. Deployment and
   a general strategy expansion are separate actions. Rollback is removal of the
   wrapper override, restoring the preserved baseline strategy.

## Validation handoff

This review changed documentation only and requires no long simulation command.
After implementation, the required repository check is:

```sh
npm run check
```

The user will run long checks and return their output. Do not start the full
benchmark again: the 672 paired blocks, 4,608 continuations and fixed checks are
already complete. No build is required solely for a bot strategy change; add it
if implementation also affects routing, rendering, environment or deployment.

## Implementation completed

The production registry now selects `OpeningAwareEquityRulesBot` for the unchanged
catalog ID, wrapping the original `EquityRulesV2Bot`. Only the medium-KK fold-only
3-BB rule is promoted. The original class, strategy, benchmark sources, manifests
and evidence remain unchanged. The production module imports no benchmark code.
Sizing diagnostics are recomputed by exact amount; other baseline metadata stays
intact and guard misses return the original decision object.

Before production edits, `baseline-source-v1.json.gz` preserved all 344 frozen
source files plus the six original manifest/evidence archives. Its hash and
restoration instructions are in [the guide](README.md#preserved-baseline-reanalysis).
A fresh restored tree reproduces the original analysis with the matching installed
engine. Current frozen-run commands must use that tree because the live source
set has intentionally changed.

Focused tests exercise the registry and engine across all 24 measured medium-KK
settings at 5,000 samples, compare actions with the original benchmark candidate,
and verify guard misses, non-fold baseline preservation, deferred QQ, illegal
raise bounds and sizing diagnostics. This implementation does not claim new
playing-strength evidence beyond the completed conditional study. Rollback is
switching the registry back to `EquityRulesV2Bot`.

Validation completed: `VITEST_MAX_WORKERS=4 npm run check` passed ESLint, strict
TypeScript and all 1,947 tests in 142 files. The initial unbounded-worker run hit
two timing limits (the original combined 24-setting matrix and an existing
heads-up service test); the matrix now reports each setting separately, and the
bounded run passed without reducing the 5,000-sample budget or weakening assertions.
Baseline restoration and credential-free saved-data reanalysis reproduced both
original verdicts. All six original manifest/evidence files remain byte-identical.
No build, deployment, provider calls or new playing-strength simulations ran.
