# Session adaptation pilot: completed evidence

The amended execution finished with **2,609 reserved requests**, including two
unresolved failed requests, below the final 2,757 combined maximum. Only **one of
six started paired blocks completed**. Two other planned Jev blocks were skipped
under an explicit LLM-only amendment. No production change or additional inference
is justified by this report.

The single complete LLM/frequent-folder block favored memory by **22.92 BB/100**.
This is a descriptive observation from one seed block, not evidence of a reliable
playing-strength improvement. No valid paired chip comparison exists for Jev or
for LLM/frequent-caller. Heavy, behavior-dependent budget exclusions make this
primarily a feasibility result.

## Protocol and departures

See the [frozen design and information boundary](README.md). Subjects used current
production confidence-aware Jev at medium difficulty and `openai/gpt-5.4-mini` at
low reasoning/balanced playstyle. The current betting menu and 5,000-sample equity
were unchanged. Memory omitted all historical hero/opponent statistics before the
same production wrapper, preserving current-hand history and other visible inputs.
Each block planned four independent 60-hand episodes with reset 100-BB stacks,
normal button rotation, mirrored cards/seats and independent rolling 50-hand histories.

The original run stopped at reservation 889 with a recorded timeout. The operator
subsequently identified an OpenRouter key quota; the stored timeout alone cannot
establish the external cause. An explicitly authorized first amendment ran only
six untouched blocks, then stopped after 668 additional reservations with a recorded
LLM provider failure. After increasing the quota, the operator authorized only the
two untouched LLM blocks at seed 73091 and skipped the remaining Jev blocks. These
amendments followed inspection of partial evidence. Neither interrupted block was
replayed, and unused block allowances never transferred. No new seeds or replacement
blocks were added. The final execution used 1,052 reservations and had no new provider
failures; reaching a block's budget is an exclusion, not a provider failure.

## Whole-block accounting

| Provider | Opponent | Seed | Status | Complete hands / 240 | Requests | Memory minus omitted BB/100 |
| --- | --- | --- | --- | --- | --- | --- |
| Jev | Frequent-folder | 19381 | Budget exhausted | 210 | 600 | Excluded |
| LLM | Frequent-folder | 19381 | Provider timeout | 132 | 289 | Excluded |
| Jev | Frequent-caller | 19381 | Budget exhausted | 204 | 600 | Excluded |
| LLM | Frequent-caller | 19381 | Provider failure | 19 | 68 | Excluded |
| Jev | Frequent-folder | 73091 | Skipped by amendment | 0 | 0 | Excluded |
| LLM | Frequent-folder | 73091 | Complete | 240 | 452 | +22.92 |
| Jev | Frequent-caller | 73091 | Skipped by amendment | 0 | 0 | Excluded |
| LLM | Frequent-caller | 73091 | Budget exhausted | 171 | 600 | Excluded |

There are 976 completed hands in diagnostic evidence. Partial hands were never
scored. All chip comparisons from incomplete blocks, even apparently favorable
partial trajectories, are excluded. The two unresolved reservations remain spent;
their billing outcomes are unknown. Available metadata sums to approximately **$4.36
for completed LLM decisions**, not an authoritative invoice or total experiment cost.
Jev cost metadata is unavailable and must not be interpreted as zero cost.

The generated combined report has `status: complete` for the final execution while
retaining the earlier failure field and error records. This means the final schedule
finished, not that every planned block completed or that earlier failures disappeared.

## Complete LLM/frequent-folder block

| Subject seat | Memory profit, BB | Omitted profit, BB | Difference, BB |
| --- | --- | --- | --- |
| Original (0) | 89.5 | 69.0 | +20.5 |
| Swapped (1) | 82.5 | 75.5 | +7.0 |

Each entry covers 60 hands. Equal seat averaging gives
`((20.5 + 7.0) / 2) / 60 * 100 = +22.9167 BB/100`.
Pooled across the two seats, memory earned 143.33 BB/100 and omitted earned
120.42 BB/100. This is one independent block, not four independent episodes or
120 independent paired samples. There are no significance claims or confidence
intervals. Neither LLM/frequent-caller nor either Jev cell has a completed block.

| Hand window | Descriptive difference, BB/100 | Memory requests | Omitted requests | Memory decisions with a locally eligible confidence signal |
| --- | --- | --- | --- | --- |
| 1–10 | +10.00 | 45 | 46 | 0 |
| 11–30 | +48.75 | 70 | 78 | 3 |
| 31–60 | +10.00 | 101 | 112 | 22 |

The windows are not a learning curve. The largest difference occurred in the middle
window, and an advantage already existed in the early window before any enabled-arm
opponent metric met the generic ten-opportunity threshold. Different arms encountered
different decision sequences. Primary scoring includes all hands, regardless of
observation availability or advice eligibility.

## Exposure and behavioral response

Production-visible observations did accumulate. In the complete LLM block, 171 of
216 enabled-arm decisions occurred after at least one opponent statistic reached
ten opportunities. The stricter situation-specific Jev confidence signal was locally
eligible on 25 enabled-arm decisions, mostly in hands 31–60. **LLM was not supplied
Jev's derived advice**: it received the ordinary production statistics and general
production guidance. Confidence eligibility is a measurement diagnostic there.

Decision mixes differed: the memory arm recorded 79 raises, 52 bets and 49 checks;
the omitted arm recorded 75 raises, 53 bets and 70 checks, over 216 versus 236
subject decisions. Current cards, paths and encountered opportunities diverged;
these counts do not establish that a particular historical observation caused a
change or that the change had positive expected value. The positive offline control
proves that the measurement path can detect an observation-responsive scripted
subject, not that the live LLM learned an opponent model.

Jev's enabled arms had **zero confidence-advice activations across 609 decisions**.
In both recorded Jev blocks, the maximum observed opponent opportunity counts were
one for small-open folds, two for large-open folds, and zero for flop/turn/river
folds facing a bet. These relevant metrics never approached production thresholds,
even though more general statistics accumulated. This is insufficient adaptation
exposure, not evidence that Jev ignores strong usable opponent advice. Both Jev
blocks also exhausted the request allocation before completing.

The incomplete LLM/frequent-caller block accumulated observations and 22 locally
eligible confidence signals in its enabled arm. Its 600-request cap stopped the
block at 171/240 completed hands; no partial chip comparison is reported. The
full generated JSON retains per-window public metric counts, action/sizing summaries,
request counts, costs and failures for every block, including incomplete blocks.

## Interpretation and next decision

Keep current production behavior. This pilot establishes that the visible-statistics
pipeline can accumulate observations, and it records one favorable complete LLM
contrast. It does **not** establish a general chip benefit, a reliable learning
curve, LLM superiority over Jev, or any Eevo strength claim. There is no paid Eevo
evidence. The offline Jev/Eevo checks establish scripted compatibility only.

A larger confirmatory study is premature. All three budget-exhausted blocks had
more decisions per episode than the cap supported, and Jev generated almost no
relevant adaptation opportunities. Any future experiment should first specify a
feasible whole-block request allocation and exposure design, freeze new analysis
rules before inference, and obtain a separate explicit budget authorization. Do
not extend these sessions, reduce thresholds, add seeds or replay excluded blocks
to repair the observed missingness. A focused policy experiment is a separate
future choice, not a production change supported by these results.

## Reproduction and evidence

Run `npm run benchmark:session-adaptation:report` with the three original ledgers
and their three freezes retained in this directory. Reporting loads no credentials
or inference clients. It validates both amendment lineages and writes Markdown and
JSON to `benchmarks/results/`. Regenerating the report spends no requests. Do not
rerun live commands or delete permanent `.started` markers.

SHA-256 of immutable evidence files:

| File | SHA-256 |
| --- | --- |
| `freeze.json` | `83289e721cfdef096c95c8e11af7083097e7173d0cd5c643a03dd602d51208a4` |
| `live-ledger.json` | `69dbdef7bce1512dd6e0aa865a881e03601d5c8f26a3afcc5de04d6f4a1d0c9b` |
| `continuation-freeze.json` | `2f48e8bdfdc564a7f8c9b41f3dc75487476753bd27e8f5654640f02158623a4d` |
| `continuation-ledger.json` | `405f87d56953415d354dc5f25501e86d36f89c6826173bdaaf10e210b17671f9` |
| `llm-freeze.json` | `8c60d887c73dfe452dfacee5e413e775a96f014367713c5fa509b8a204a1cbfc` |
| `llm-ledger.json` | `a9a6f476dc5bfa356c7a42670119e382c152b47d080b25daa555c15e5092bd6b` |

The local ledgers contain only allowlisted synthetic summaries and metadata; they
remain gitignored. Private states, decks, historical holdings and raw provider
responses are absent. Frozen seeded offline scripts reproduce fixture histories;
live stochastic provider trajectories are represented by recorded action summaries.
The report uses no new external strategy source. [Game Arena attribution and the
information-boundary differences](README.md#attribution) remain applicable.
