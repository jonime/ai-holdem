# Jev AA/KK opening-size conditional action-value study v1

Status: **completed development; Defer, retaining current production behavior**.
All 192 blocks (4,608 rollouts) completed with zero failures. Neither AA nor KK
qualified at any smaller size, so confirmation correctly ran zero blocks. The
[completed report](report-v1.md) records the comparisons and continuation limits;
[verification](verification-v1.json) binds the preserved evidence. This study made
no provider calls or production changes. Six-seat openings, defensive re-raises,
other hero holdings and paid Eevo trials remain excluded. No application server,
database, credentials or environment files are needed.

## Motivation and regression evidence

The [production audit](../bot-audit/live-report-2026-10-15.md) recorded three
100-BB opening shoves each for AA and KK. The
[improvement study](../bot-improvements/report-2026-10-15.md) recorded three each
in both baseline and canonical input arms: eighteen historical requests total.
All report observed model `jev-1.13.0`, configured alias `jev-latest`, medium
`typesafe-poker-v4.1-confidence`. This does not establish current remote behavior.

`motivation-v1.json.gz` preserves the matching sanitized observations, input
hashes, source/evidence archive SHA-256 hashes, configured metadata and mechanical
replay specifications. Verification matches the saved allocations, source-file
manifests and reconstructed baseline/canonical input hashes. Historical fixtures
are HU button/small-blind openings, equal 200-chip stacks, blinds 1/2, hand 1,
no prior voluntary action. `raise amount: 200` commits a **total** of 200 chips;
the button has 199 chips immediately before acting and pays 199 more. These
requests motivate the study; none becomes a new sampled deal or return observation.
Historical archives/freezes are unchanged.

## Frozen experiment

Each hand class has six physical suit combinations × real engine hand numbers
1, 2, 7 and 16: 24 equally weighted strata. Setup reuses the established
`preflop-candidate/fixtures.ts` neutral royal-board hand advancement: prior hands
actually complete with equal stacks and the button rotates. No context-only hand
number substitution is used. Current-hand history is complete and empty at root;
setup hands supply neither session statistics nor inferred opponent tendencies.

Integer-chip root raise-to amounts are 200, 4, 5 and 6 (100, 2, 2.5 and 3 BB).
Every action goes through the production adapter. Hero's pair alone is fixed;
all other cards are shuffled without replacement with a versioned SHA-256-seeded
stream. Each block shares one complete deck across every arm and all six cells.
Development/confirmation and smoke have disjoint seed namespaces, separate from
older studies. Each hand is completed through the engine, including automatic
all-in runouts, ties and uncalled refunds. Return is terminal hero stack minus
the pre-root stack, divided by two. Thus a shove that wins just the blinds returns
+1.5 BB under this requested accounting, not +1 BB from before posting the blind.
Stacks plus live pot must conserve all 400 chips at every step. At most 200
applied actions are permitted per arm, including the root.

Opponent policies cross current medium `OpeningAwareEquityRulesBot` throughout,
selective first response then current medium Rules, and loose first response then
current medium Rules. The scripted overrides apply only to the opponent's first
response to the root, even if hero later raises. They classify only that actor's
own cards, without conditioning their ranges on hero's known pair.

| Opponent | Facing 2–3 BB | Facing 100 BB |
| --- | --- | --- |
| Selective | Raise QQ+/AK to 3× hero's total; call 77–JJ, AQ, AJs, KQs; fold others | Call QQ+/AK; fold others |
| Loose | Raise JJ+/AQ+ to 3× hero's total; call other pairs, aces, suited kings, two-card broadways, suited connectors; fold others | Call 88+/AJ+/KQs; fold others |

AQ+/AJ+ include both suits; broadways are A/K/Q/J/T. Connectors have adjacent
ranks and explicitly include A2s. Raise takes precedence. Re-raises are total
commitments 12/15/18 chips, paying 10/13/16 after the BB. Shove calls pay 198.
The freeze contains both fully expanded 169-class tables, plus configurations and
all allocations. Smoke engine-validates all 1,352 table responses, including calls,
folds and exact raise amounts. These contrasting synthetic policies are not
calibrated human ranges.

Hero continuations are current medium Rules and the conservative control: check
when free; otherwise call only if sampled equity exceeds contestable-pot call
odds by at least .05 (equality at the .05 margin calls), fold otherwise; never bet or raise. Exact heads-up river
share enumeration forces a nonnegative guaranteed call and rejects calls losing
to every possible holding, regardless of the sample. Neither continuation is Jev.
The same hero continuation is used in all root arms within each comparison.

The Rules state/history/sizing projection matches production
`bot-turn-service.ts`: `createPokerAIState`, legacy projected history,
`correctedContext: false`, medium difficulty and legacy sizing. For both
continuations, contestable-pot call odds use call cost divided by the contestable
pot after calling. Equity is the production random-opponent Monte Carlo estimator
with **5,000 samples**, not equity against the scripted range. Only its seed is
replaced to provide common random numbers: block ID / acting seat / street /
actor decision ordinal. This stream is shared across root arms and cells; paths
with different visible states naturally produce different estimates. The
projection's unused one-sample estimate is replaced before any decision. No
hidden holding, burn card or future board enters a context or equity estimate.
Rules' existing deterministic visible-history action choices remain unchanged.

## Manual execution and recovery

Use Node 24 (the exact version is recorded), installed lockfile dependencies and
one heavy command at a time. The assistant may run focused tests, smoke and
`check`. **The user runs development and confirmation manually.** The assistant
must not launch or poll those studies. Expect full stages to take several minutes
or longer depending on hardware; no runtime estimate is used as a stopping rule.

```sh
nice -n 15 npm run benchmark:jev-preflop-sizing -- smoke
nice -n 15 npm run benchmark:jev-preflop-sizing -- development
nice -n 15 npm run benchmark:jev-preflop-sizing -- confirmation
nice -n 15 npm run benchmark:jev-preflop-sizing -- analyze
```

Smoke freezes sources before development and runs one separate AA paired block
at 5,000 samples (24 completed rollouts), plus the full deterministic mechanical
matrix. It does not contribute to development or confirmation. It creates,
exclusively, `freeze-v1.json`, recoverable base64 `source-v1.json.gz`,
`motivation-v1.json.gz`, and the manifest-bound `mechanical-v1.json`. Smoke can
be repeated only with identical results and sources; existing freezes are never
rewritten. Source hashing conservatively covers current lib/benchmark code,
engine declarations/runtime, Zod, the TypeScript transpiler, package/lockfile,
and historical evidence. A source/Node/configuration/allocation mismatch rejects
resume. A future source change requires a separate version; do not edit this
freeze to accept it. The bundle's per-file bytes and SHA-256s permit recovery in
an isolated checkout with lockfile dependencies, without reverting the working
application or overwriting old studies.

One offline worker has an allowlisted empty-of-secrets environment, no env-file
loader and blocked fetch, WebSocket, socket, DNS, HTTP and subprocess APIs. The
coordinator clears its inherited environment too. No provider resolver is used.
Workers inherit reduced scheduling priority. The coordinator exclusively locks
`benchmarks/results/jev-preflop-sizing-v1/`; dead same-host owners can be recovered,
while live/foreign owners and uncertain ownership are rejected.

Each successfully returned whole block is atomically checkpointed. Repeating a
stage reads compatible saved blocks and computes only unfinished blocks. A crash
inside an unfinished block may recompute that same deterministic block; no fresh
seed or replacement sample is allocated. Temporary incomplete writes do not count.
A failed arm clears all values in its paired block, preserves its failure and arm
identifier, saves the failed checkpoint and stops advancement. Re-running encounters
the same failure and stops; it cannot replace it. No failed stage can freeze a
selection or advance to confirmation. The user may still run `analyze` to inspect
partial checkpoints and failures, without replaying study continuations.

Completed stage archives and the development selection are immutable local
artifacts. After manual execution, supply the saved artifact paths for inspection
and repeatable analysis; never repeat study simulations to recreate a report. Concise
progress prints every twelve completed blocks. Analysis reconstructs deterministic fixture setup to validate deal hashes and
stack accounting; it does not rerun opening arms or continuation decisions.
JSON and Markdown reports are
written under `benchmarks/results/jev-preflop-sizing-v1/`; this ignored folder
must be retained/backed up along with all block checkpoints. No long run output
is committed automatically.

## Selection, intervals and decision

Development is four fresh deals per stratum (96 blocks/hand, 192 total), with
four roots × six cells = 24 rollouts per block, 4,608 planned rollouts. A smaller
opening qualifies only when its paired mean versus shoving is positive in every
cell and every planned development block completes. Select the qualifying size
with the largest worst-cell **mean**; exact ties choose the smaller opening.
Intervals do not drive development selection. Freeze one size per qualifying hand
before confirmation; no qualifying hand means no confirmation simulations.

Confirmation uses ten fresh deals per stratum (240 blocks per qualifying hand),
only shove versus the selected size across six cells: 2,880 rollouts per qualifying
hand, 5,760 maximum. No post-confirmation size switches, added deals, altered
controls or narrowed population may rescue a failure.

Intervals use 20,000 seeded stratified whole-deal-block bootstrap resamples, with
replacement within each of the 24 strata and equal stratum weight. The same
resampled block-index stream is reused across cells/arms; correlated cell values
are never counted as independent deals. Development intervals are descriptive
95%. Confirmation uses two-sided confidence `1 − .05/12` for each of the twelve
planned comparisons, including when only one hand qualifies. Percentile coverage
is approximate. Failure or incomplete allocation prevents passing even if
available-case descriptive intervals appear favorable.

For each hand and cell, `analysis.json` records mean terminal returns, paired
mean differences/intervals, worst returns and paired losses, root response counts
(and completed-block denominator), flop/showdown frequencies, and mean later
chip payments. Hero later payments exclude the tested opening; opponent payments
include its first response and subsequent actions. These are gross action
payments; refunds and pot awards enter terminal returns. AA and KK remain separate.

Confirmation passes for a hand only with all six adjusted lower bounds above zero,
240 complete paired blocks and passing mechanical checks. The generated report
then concludes **Shortlist AA and/or KK for a separate Jev intervention and
paid-confirmation plan**, giving the selected size and these continuation
limitations. Otherwise it concludes **Defer, retaining current production behavior**.
The result is a conditional action value under substituted continuations—not
actual Jev returns, GTO values, a proven playing-strength improvement, or a
whole-range/BB-per-100 estimate. Passing authorizes neither provider spending nor
an automatic action override.

Focused tests: `nice -n 15 npm run test:benchmarks -- benchmarks/jev-preflop-sizing/experiment.test.ts`.
Run the required `nice -n 15 npm run check` after code
changes. No build, SQL, browser or deployment check is needed for this offline-only
benchmark.
