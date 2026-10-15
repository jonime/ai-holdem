# Production bot audit — 2026-10-15

This report separates completed offline evidence from the paid experiment awaiting
fresh authorization. It measures fixed synthetic decisions, with no full matches,
adaptive opponents or production changes. Concentration and representation
sensitivity are investigation leads; they establish neither exploitability, GTO
accuracy nor stronger play.

## Evidence and reproduction

- [Method and commands](README.md).
- [Pinned source files](freeze.json).
- [Frozen paid request plan](pilot-plan.json): exactly 972 decisions, no compatibility
  probes, no retries or substitution; hard shared cap at most 1,000.
- [Sanitized offline observations](offline-evidence.json.gz), including preprocessing
  hashes and native/canonical equity estimates. Derived summaries are regenerated
  with `npm run benchmark:bot-audit:analyze`.

The production Jev/Eevo wrappers and explicit mini/low/balanced settings are recorded
in the manifests. Source hashes identify local policy code, not immutable remote
model weights. Returned model/version metadata and cost coverage remain unknown
until authorized provider requests are made.

## Mechanical invariants

The twelve engine-replayed fixtures cover the prescribed HU/multiway streets,
card distinctions, draw and kicker cases, a stack-capped call, and exact HU river
split protections. Their five representations invert suits, hero deal order,
cyclic seats and tenfold chip amounts. Synthetic recorded histories project absent,
insufficient and qualifying opponent evidence. Historical holdings and raw replay
states stay out of actual provider requests.

The controlled comparison substitutes only the canonical 5,000-sample equity
scalar. Native recomputed equity remains evidence. Normalization checks legal
bounds, prices, history/position, facts, statistics, advice and action/size menus;
physical best-five representatives on tied ranks are compared semantically by
rank together with the full rank/kicker facts. Raw fact hashes retain the physical
representation detail.

All **60/60** controlled mechanical checks passed, with zero normalized
component mismatches. Native provider preprocessing changed only the equity field
(in the normalized `prices` component) in **34/60** checks; the largest absolute
change was **0.0166** equity share (1.66 percentage points). These are seeded MC
representation differences, not provider reasoning observations. For example,
`HU-open-suited` estimates A5s at 0.6074 originally and 0.5942 after the suit cycle.
The controlled comparison supplies 0.6074 to both.

All **17,811** offline actions were accepted by the engine, with **zero failures**.
There are **5,937** distinct input/difficulty/mode cells; all three repeats agree
in every cell (100% repeat agreement, zero within-cell empirical action entropy).
This establishes reproducibility on these inputs, not desirable strategic mixing.

## Representation sensitivity

Paid Jev, Eevo and LLM representation results are pending authorization. There are
no paid observations, empirical provider distributions, significance claims or
model comparisons in this report. Their prescribed 180 requests each comprise
12 situations × five representations × three repetitions.

Rules has 144 representation contrasts in each preprocessing mode, each with
three complete matched repetitions. **No pairs were excluded:** 432 complete
pairs per mode, 864 across both modes.

| Rules preprocessing | Contrasts with a changed action/size | TV in changed contrasts |
| --- | ---: | ---: |
| Native legacy production context | 16 / 144 | 1.0 |
| Shared canonical 5,000-sample equity | 4 / 144 | 1.0 |

The four controlled differences are all `4-turn-draw`: medium and hard each
bet **2 BB** in the original, suit-permuted and hole-reversed cases, but **check**
after seat rotation or chips ×10. Every repeat agrees. Its canonical equity is
0.3991. This is a concrete residual representation-sensitivity lead in Rules'
deterministic semi-bluff/hash path; it is not paid-provider variability or evidence
of exploitability. Easy checks in all five representations.

The other twelve native differences disappear under fixed equity:
`HU-open-suited` changes raise-to-2-BB to a 0.5-BB call under suit permutation
at all difficulties. `HU-defend-offsuit` changes a 2-BB call to raise-to-5-BB
under suit permutation, hole reversal and seat rotation at all difficulties.
Rules' native legacy history also seeds equity differently from the corrected
provider history. The controlled mode intentionally uses the shared provider
canonical estimate: even the original KJo defense changes from native call to
controlled raise. It is an ablation, not a claim that the controlled original is
the native production decision. The recorded native MC values in the mechanical
section describe provider preprocessing; Rules native behavior is reported separately.

Safety/control cases were stable across every representation, difficulty and mode:
`HU-turn-capped-call` calls exactly 4 BB; `HU-river-board-split` calls 99 BB for
the forced split; `5-river-board-kicker` checks. There were no unsupported river
folds or invented larger calls in these fixtures. Other river situations remain
outside this twelve-case matrix.

## Predictability diagnostics

The offline preflop matrix covers all 169 classes, all 11 existing nodes and all
three difficulties, with three identical repeats: 5,577 cells and 16,731 decisions.
Each node's combination mass is 1,326; repeated weights do not create additional
independent holdings. Each class has one physical representative, so weighted
results do not enumerate all 1,326 combinations, especially when suit/hash effects
exist. Reports retain action/size distributions, repeat agreement,
entropy and weighted hand-category/class composition conditional on actions.

The paid subset is different: exactly 24 specified classes, two HU nodes and three
repeats (144 decisions per provider). Its 6/4/12 weights remain conditional on
that subset. The subset cannot describe a complete opening range. Model-returned
probability vectors are diagnostic fields, separate from observed action frequencies.

The following are weighted representative-class diagnostics for the full Rules
matrix, with repeated weight mass 3 × 1,326 per row. They are not observed frequencies
against real opponents or numerical GTO targets.

| Node / difficulty | Fold | Call | Raise | Action entropy (bits) |
| --- | ---: | ---: | ---: | ---: |
| HU opening / easy | 0.90% | 85.67% | 13.42% | 0.641 |
| HU opening / medium | 0.00% | 86.58% | 13.42% | 0.569 |
| HU opening / hard | 0.00% | 83.86% | 16.14% | 0.638 |
| HU BB defense / easy | 21.42% | 64.56% | 14.03% | 1.281 |
| HU BB defense / medium | 14.18% | 71.79% | 14.03% | 1.140 |
| HU BB defense / hard | 1.81% | 84.16% | 14.03% | 0.712 |

Every HU opening raise is to 2 BB; every defense re-raise is to 5 BB. Medium HU
opening raises have conditional category composition **30.34% pairs / 22.47%
suited / 47.19% offsuit**. Medium defense raises are **29.03% / 25.81% / 45.16%**.
These conditional compositions are different objects from the overall action mix.
Full hand-class/action-size composition for all 33 node/difficulty combinations is
available from the analyzer.

A higher-priority concentration lead is `six-open-UTG`: easy/medium fold **99.55%**
of representative weighted mass and call **0.45%**, with no raises. Conditional on
calling, the hand is **AA with 100% weight**. Concrete medium fixtures
`six-open-UTG-KK`, `six-open-UTG-QQ`, `six-open-UTG-AKs` and
`six-open-UTG-AKo` all fold, while `six-open-UTG-AA` calls 1 BB. At the hijack,
medium only calls AA/KK and folds 99.10% of weighted mass. These observations
justify examining multiway preflop equity thresholds and active-opponent handling;
they do not quantify EV loss. In contrast, medium HU opening calls 72o for 0.5 BB,
while hard additionally raises T9o, T8o and 72o via its deterministic bluff selection.

Recommended separate offline follow-ups:

1. Trace the Rules preflop feature/equity thresholds for the named UTG/hijack
   premium holdings across the existing nodes; independently evaluate action value
   before grading them as strategic errors or changing production.
2. Enumerate physical suit combinations, hand-number/hash seeds and exact scale
   variants of `4-turn-draw`, holding equity fixed, to isolate the deterministic
   semi-bluff selection mechanism. Do not interpret repeated identical decisions
   as independent evidence or a required frequency target.
3. Recompute borderline A5s/KJo equity with independent larger sample budgets and
   suit/order-canonical seeds in a benchmark ablation. Compare mechanics and action
   thresholds; any production equity or mixing change needs separate review.

## Operational reliability and bot-specific conclusions

| Bot | Completed evidence | Bounded conclusion / next experiment |
| --- | --- | --- |
| Jev | Mechanics and mocked production transport only; zero paid calls | No provider sensitivity or predictability finding yet. After authorization, compare HU opening and paired-kicker decisions against same-input variation, including confidence advice. |
| Eevo | Mechanics and mocked production transport only; zero paid calls | No provider behavior finding yet. Use the same frozen cases and its own model/client; compare missing/version metadata and failures separately. |
| LLM | Explicit mini/low/balanced transport/schema checks; zero paid calls | No empirical LLM finding yet. Verify returned model identity, then inspect draws, capped prices and river split candidates; do not generalize to other models/playstyles. |
| Equity Rules | 17,811 legal offline decisions; zero failures | Investigate UTG premium-hand folds and the four controlled `4-turn-draw` contrasts. Determinism alone is not a failure. |

The shared ledger reserves before inference, counts failures, enforces one transport
request per slot and refuses replay after interruption. Analysis can regenerate a
partial report without credentials or inference and reports interrupted reservations
separately. Missing cost/usage metadata is coverage absence, not free inference.
The no-provider offline run incurs no inference charges. Its recorded decision-only
median/p95 both round to 0 ms: these timings exclude the expensive equity/context
preparation and must not be read as end-to-end performance. The full audit took
575.74 seconds on this host. No paid usage/cost/model metadata is available; zero
coverage is not a claim of free provider execution.

The 204-file source freeze and 972-slot controlled-input plan were verified; plan
SHA-256 is `9da14c8c8e821d4615fdc5bc0fff24c8ac499795db51902b2ce020823d43bdf9`.
Earlier benchmark evidence was not modified. The paid pilot remains unexecuted.

## Verification

- `npm run check`: 137 files / 1,872 tests passed, including 17 focused audit tests.
- Offline `npm run test:bots`: 60 passed / 120 paid-provider cases skipped.
- `npm run benchmark:poker-context`: two passed / one paid case skipped.
- `npm run benchmark:bot-audit`: 17,811 observations, one offline test passed;
  the paid test was skipped.
- `npm run benchmark:bot-audit:analyze`: regenerated all 17,811 observations;
  saved groups match the run summary. A synthetic interrupted-ledger check also
  retained the reservation and excluded all missing comparisons.
- Source, paid-plan and evidence hashes match; `git diff --check` passed.

A check run overlapping CPU-heavy audit work hit six existing five-second test
timeouts. Rerunning the unchanged suite after the audit finished passed all 1,872
in 47.19 seconds; no timeouts, expectations or production invariants were weakened.
No build, SQL or browser run was needed for these benchmark-only changes.

## Interpretation and research attribution

GTO Wizard's [Principles of GTO](https://blog.gtowizard.com/principles-of-gto/)
and [The Three Laws of Indifference](https://blog.gtowizard.com/the-three-laws-of-indifference/)
inform the distinction between action EV errors and frequency errors. This audit
has no equilibrium strategy or action EV reference, and therefore does not measure
either kind of strategic mistake directly. It measures concentration and input
sensitivity instead. No solver data/code or numerical GTO targets are reused.

Three repetitions do not support statistical significance, stable mixing estimates
or claims of exploitability. Exclude incomplete matched repetitions and show their
counts. Any follow-up paid observations need separate explicit authorization;
production fixes, richer menus, adaptive opponents and mixing changes are outside
this audit.
