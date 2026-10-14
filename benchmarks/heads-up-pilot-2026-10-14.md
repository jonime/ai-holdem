# Heads-up pilot evidence — 2026-10-14

Recommendation: retain the production model configuration, including nano/minimal. Shared guidance and factual history are ready for a controlled rollout, but this pilot does not establish stronger overall poker. Nano/low was slower and favored calls; mini/low was more aggressive and materially more expensive. Neither has enough quality evidence to justify a model switch.

## Budget and protocol

The run used **892 of at most 1,000 requests**: 640 fixed decisions, 177 initial match requests, and 75 fresh Equity Rules match requests. Failed requests count. There were no automatic retries or model substitutions. Production model settings were unchanged. OpenRouter accepted `openai/gpt-5-nano` (minimal/low) and `openai/gpt-5.4-mini` (low), with strict structured output, parameter support required, fallback disabled and returned-model checks.

The 40 fixed cases were each repeated twice across eight variants, using balanced LLM playstyle. They cover 10/25/100 BB, unequal stacks, opens, BB defense, limps, re-raises and postflop/exact-river pressure. History variants receive a controlled 20-hand, adapter-validated synthetic observation window. These are fixed cases, not a random sample of real poker decisions. All 169 weighted starting-hand classes and all playstyles are covered offline.

## Fixed-case measurements

Each row has 80 attempts over 40 cases. Action counts are recorded outcomes, not GTO labels. Aggression combines bets and raises. Latency is for successful requests; missing billing details are not estimated.

| Variant | Fold / call / aggression / check | Provider failures | Median / p95 latency | Known reported USD | Known tokens | Same action across repeats |
| --- | --- | ---: | --- | --- | --- | --- |
| Jev current | 18 / 50 / 6 / 6 | 0 | 0.29s / 0.71s | Unavailable | Unavailable | 40/40 |
| Jev guidance | 18 / 49 / 7 / 6 | 0 | 0.28s / 0.62s | Unavailable | Unavailable | 37/40 |
| Jev guidance + history | 18 / 53 / 3 / 6 | 0 | 0.31s / 0.54s | Unavailable | Unavailable | 39/40 |
| nano/minimal current | 17 / 36 / 24 / 2 | 1 | 1.10s / 1.67s | $0.00579 (79/80) | 117,529 (79/80) | 22/39 |
| nano/minimal guidance | 20 / 26 / 34 / 0 | 0 | 1.13s / 1.72s | $0.00552 (80/80) | 138,544 (80/80) | 27/40 |
| nano/minimal + history | 11 / 38 / 27 / 3 | 1 | 1.13s / 3.49s | $0.00587 (79/80) | 272,527 (79/80) | 22/39 |
| nano/low + history | 5 / 56 / 12 / 6 | 1 | 7.20s / 13.84s | $0.03173 (79/80) | 331,340 (79/80) | 30/39 |
| mini/low + history | 7 / 23 / 46 / 4 | 0 | 4.74s / 9.65s | $0.23739 (80/80) | 299,598 (80/80) | 35/40 |

No fixed-case illegal-action or exact-river failures occurred. Missed guaranteed value and provably unproductive river aggression were both zero across variants. Ordinary legal decisions remain ungraded: these checks do not establish value extraction, calibrated bluffing or overall strength. Three provider failures occurred: nano/current BB defense with JTs at 100 BB, nano/minimal/history button opening with 72o at 25 BB, and nano/low/history royal-board river facing a small bet. No failed decision was replayed. The live command intentionally returned nonzero because provider failures are retained.

## Opening and defense opportunities

Button openings and BB responses each have 24 attempts (12 fixed cases × 2 repeats). Open-limp calls and BB defense calls are distinct opportunities. Failures stay in the denominator; they do not count as folds.

| Variant | Button raise / limp / fold / failed | BB raise / call / fold / failed |
| --- | --- | --- |
| Jev current | 6 / 12 / 6 / 0 | 0 / 18 / 6 / 0 |
| Jev guidance | 6 / 12 / 6 / 0 | 0 / 18 / 6 / 0 |
| Jev guidance + history | 3 / 15 / 6 / 0 | 0 / 18 / 6 / 0 |
| nano/minimal current | 16 / 5 / 3 / 0 | 0 / 14 / 9 / 1 |
| nano/minimal guidance | 20 / 2 / 2 / 0 | 3 / 9 / 12 / 0 |
| nano/minimal + history | 12 / 9 / 2 / 1 | 2 / 20 / 2 / 0 |
| nano/low + history | 10 / 14 / 0 / 0 | 0 / 24 / 0 / 0 |
| mini/low + history | 18 / 6 / 0 / 0 | 14 / 9 / 1 / 0 |

Jev had 18 folds in every variant and mostly limped its button; guidance/history did not demonstrate a reduction in folding. Nano guidance alone increased BB folds (12/24 versus 9/24 current), while history reduced them (2/24). Nano/low called all 24 BB responses; mini/low raised 14/24. These shifts could reflect useful adaptation or over-continuation/over-aggression. This case set cannot distinguish those explanations. Nano repeat disagreement is also substantial. Do not infer that fewer folds mean better play.

## Paired matches and uncertainty

Three complete paired blocks were started: all eight variants in both seats with one common seeded deal per opponent (48 hands). Hands were bounded to 12 actions and six subject requests. An initial Equity Rules block used corrected provider context instead of its legacy context; its 16 hands were discarded. It was replaced with fresh seed 201 under the remaining shared cap. The initial fixed-policy aggressive/passive blocks were retained. All excluded requests and their known charges remain counted. The final harness preserves Equity Rules context.

The corrected rules block had six incomplete hands and the aggressive block had five. Both whole blocks are excluded from every comparative chip estimate. The passive block completed all 16 hands. There is therefore **one usable paired block**, two hands per variant, and no uncertainty interval (fewer than two blocks). These fixed opponents, synthetic histories, truncation and the tiny surviving sample do not support a strength ranking.

| Variant | Passive block mean BB/hand (2 hands) |
| --- | ---: |
| Jev current | +0.00 |
| Jev guidance | +0.00 |
| Jev guidance + history | +0.00 |
| nano/minimal current | -5.50 |
| nano/minimal guidance | +4.50 |
| nano/minimal + history | -2.00 |
| nano/low + history | +1.00 |
| mini/low + history | +3.75 |

Known OpenRouter charges across fixed cases and all match requests, including excluded requests, total **$0.46229**. This is incomplete billing: Jev omitted usage/cost, and failures may omit charges. For the fixed cases, mini/history cost about 40 times nano/minimal/history in reported totals; nano/low was about six times slower at median latency than nano/minimal/history. Prompt caching, reasoning/output tokens and missing charges limit generalization.

## Validation and rollout

`npm run check` passed (121 files, 1,640 tests). Offline bot scenarios, context and policy benchmarks passed. Service-role context SQL tests, bot-claim concurrency SQL tests and pinned CLI 2.119.0 generated-type checks passed. The production build passed. The additive session RPC was applied to the local database without resets or backfill. Deploy `20261028000000_add_bot_session_context.sql` to the target database before application code. No deployment or production-model change was performed.

The detailed sanitized results are preserved in [the dated evidence snapshot](evidence/heads-up-pilot-2026-10-14.json), with [run metadata and checksum](evidence/heads-up-pilot-2026-10-14.manifest.json). The working report remains `benchmarks/results/poker-context-live.json` (ignored by Git and overwritten by future runs). Keep the fixed-case comparison, counts/denominators, unknown billing coverage and excluded match blocks when interpreting it. A future strength study needs more completed paired blocks, better varied opponents and independent strategic review; research results from detailed ranges, solvers or specialized training cannot be transferred to this qualitative prompt change.
