# Corrected Plan 3 pilot — 2026-10-14

**All 960 additional decisions completed successfully. The advice changes Jev's
heads-up behavior, but its sizing is concerning; production promotion is not justified.**

This independently authorized run uses corrected `opponent-advice-twelve-v2`
controls and the same `opponent-fold-advice-v1` challenger. Both providers completed
480 calls, all five repetitions per cell, and all 480 matched policy pairs. There
were **zero network, provider, output-contract or engine-validation failures**,
zero excluded policy pairs, no retries and no model substitutions.
The earlier v1 sample is preserved separately and is not pooled into this analysis.

## Why the first run failed

The initial runner was launched inside a restricted network environment and lacked
a first-failure stop. That caused 721 immediate network failures before it was
interrupted. It was an execution/preflight mistake, not evidence of calling the
providers too quickly. Outside that restriction, the remaining 239 v1 decisions
and all 960 corrected decisions succeeded sequentially.

The corrected runner checks connectivity with unauthenticated HEAD requests before
inference and shares a first-provider-failure stop across providers and policies.
It keeps one inference in flight, records the cap reservation before the request,
and atomically preserves partial results. No failure or limit response occurred
in this complete run. Its new 960-call allocation is now exhausted.

## Main behavioral result

Pressure means a bet or raise, not better poker. The table uses the **ten
advice-eligible fixtures**, five repetitions each: **50 decisions per cell**.
The two multiway preflop situations remain suppression controls because the
existing aggregates have no relevant BB-opening fold observations.

| Provider / history | Current pressure | With advice | Difference |
| --- | --- | --- | --- |
| Jev, omitted target observations | 10/50 (20%) | 9/50 (18%) | −2 percentage points |
| Jev, insufficient observations | 9/50 (18%) | 10/50 (20%) | +2 points |
| Jev, frequent folding | 10/50 (20%) | 30/50 (60%) | **+40 points** |
| Jev, frequent continuation | 9/50 (18%) | 10/50 (20%) | +2 points |
| mini, omitted target observations | 46/50 (92%) | 47/50 (94%) | +2 points |
| mini, insufficient observations | 47/50 (94%) | 47/50 (94%) | 0 points |
| mini, frequent folding | 46/50 (92%) | 48/50 (96%) | +4 points |
| mini, frequent continuation | 44/50 (88%) | 38/50 (76%) | **−12 points** |

Jev's extra pressure is concentrated in the four **heads-up postflop** fixtures:
the frozen policy checked in all 20 frequent-fold decisions; the challenger bet
in all 20. Its multiway postflop decisions remained checks. Thus the +40-point
mixture does not establish multiway adaptation. The effect is much larger than
the observed identical-request control variability in these fixed situations.
Against frequent continuation, Jev's incremental aggression was small.

Mini already selected aggression frequently. Fold advice added little, while
continuation advice reduced aggression in some cases. Its substantial stochastic
sizing variation limits conclusions from changed actions alone. Neither model's
changed action or aggression rate establishes improved expected chip value.

## Sizing concern

Jev selected **17 all-ins in the frequent-fold advice condition, versus zero
in the corresponding frozen-policy condition**:

- Five all-in raises in the weak-hand, large-open-bucket heads-up case.
- Five all-in bets in the heads-up made-hand flop case.
- Two all-in bets in the heads-up turn case.
- Five all-in bets in the heads-up river case.

Those twelve postflop all-ins bet **10,082 chips into a 4-chip pot**, about 2,520.5
pots. The historical sequence and canonical decisions use unusually deep synthetic
stacks (about 5,000 BB). The opening-size bucket and street fold counts do not
establish how an opponent responds to this extreme commitment. In particular,
"consider more pressure" must not be interpreted as evidence that all-in sizing
is profitable or necessary.

These actions are legal and are **not graded as solver-certified mistakes**; no
independent range/EV reference is available. They are nevertheless a concrete
reason not to call the behavior an improvement or promote this advice. Representative
stack-depth and sizing experiments are needed before a full-hand strength trial.
Preserve all candidates and exact safeguards in any future challenger; do not
hide this result by weakening the evaluation or rewriting this frozen run.

## Matched contrasts and stochastic controls

The table includes all twelve fixtures: **60 complete pairs per row** (five per
fixture). "Action or size" compares the exact engine action; "type" ignores size.

| Provider / history | Changed action or size | Changed action type | Advice-eligible pairs |
| --- | --- | --- | --- |
| Jev, omitted | 2/60 | 2/60 | 0/60 |
| Jev, insufficient | 4/60 | 4/60 | 0/60 |
| Jev, frequent folding | 27/60 | 22/60 | 50/60 |
| Jev, frequent continuation | 2/60 | 2/60 | 50/60 |
| mini, omitted | 29/60 | 9/60 | 0/60 |
| mini, insufficient | 28/60 | 6/60 | 0/60 |
| mini, frequent folding | 31/60 | 7/60 | 50/60 |
| mini, frequent continuation | 35/60 | 15/60 | 50/60 |

When advice is suppressed, current/challenger requests are identical. Differences
in omitted and insufficient **policy pairs** are stochastic controls. The advice
builder added no tendency guidance below ten opportunities. The raw summaries
also flag 24 **history-versus-omitted** groups for sparse-observation review;
those inputs differ in their target statistics, so an action difference alone is
not proof of unsupported adaptation. Do not grade intent from returned moves.

The corrected control retains identical HERO and unrelated statistics, coverage,
cards, stacks, action line and legal menu across all four histories; only target
observations vary or are omitted. A focused test checks this in every condition.

## Latency, usage and cost

| Provider | Successful decisions | Median / p95 decision latency | Reported usage and cost |
| --- | --- | --- | --- |
| Jev (`jev-latest`, medium) | 480/480 | 0.339 / 0.476 seconds | unavailable |
| `openai/gpt-5.4-mini`, low, balanced | 480/480 | 3.557 / 6.949 seconds | 1,798,660 input + 137,817 output tokens; **$0.9207939** |

OpenRouter usage/cost covers **480/480 mini calls**, or **480/960 total calls**.
Jev provided no token or cost data. The subtotal is gateway-reported actual cost
for this corrected run, not complete cross-provider billing and not a pricing
estimate. Latency covers successful decision execution, including local work.

## Evidence, validation and recommendation

- [Complete sanitized rows and summaries](../evidence/opponent-advice-v2-live-2026-10-14.json)
- [Frozen input/source/model metadata](../evidence/opponent-advice-v2-metadata-2026-10-14.json)
- [Derived distributions, matched contrasts and checksums](../evidence/opponent-advice-v2-analysis-2026-10-14.json)
- [Reproducible offline analyzer](analyze.mjs)
- [Earlier incomplete v1 evidence](live-report-2026-10-14.md)

The run verifies the original source freeze plus the corrected fixtures, network
preflight and first-failure guard. Exact synthetic public contexts remain in the
ignored local input manifest; curated evidence omits raw requests/responses,
credentials, ownership tokens, historical cards and engine states. Source and
input checksums make reconstruction reviewable. Production prompts, models,
selection, persistence and public contracts remain unchanged.

`npm run check` passed lint, strict typechecking and **1,846 tests in 134 files**.
A concurrent run first hit fixture-setup timeouts under load; the safety test's
unnecessary full matrix setup was removed and the two full-fixture tests received
30-second timeouts, with their assertions preserved. The final full check passed.
The live runner completed its full allocation successfully; corrected offline
wiring and all-condition invariance tests also passed.

**This complete sample is sufficient to demonstrate Jev's behavioral response in
these fixed situations and expose a sizing concern. It is not sufficient to
establish better poker or a win-rate improvement.** Mini's result is smaller and
mixed. Do not promote either challenger from this evidence. First investigate
Jev's sizing and representative stack depths in a separately planned experiment;
consider a separately budgeted full-hand evaluation only after that evidence
justifies it. No additional paid work runs automatically.
