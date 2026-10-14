# Range-equity sensitivity report v1 — 2026-10-14

Plan 1 produced a reusable conditional calculator and reproducible synthetic
fixtures. Production behavior is unchanged. This experiment establishes a
calculation foundation; it does not establish a bot win-rate improvement.

The run used Node v24.21.0, engine 1.0.1 and independently installed PokerKit
0.7.7. The [preserved JSON evidence](../evidence/range-equity-v1-2026-10-14.json)
contains all 39 rows, uncertainty, attempts, exact/reference results, source
hashes and uniform-baseline comparisons. The fixture SHA-256 is
`33e2bef00fb5ba98b9356b4f1591daac1dddb720d6516a18939ce87ba375edd0`.

## Sensitivity to assumptions

Shares below use 20,000 accepted samples. Standard errors measure sampling
uncertainty conditional on the hypotheses, not uncertainty in the hypotheses.

| Fixture | Opponents | Showdown share | Standard error | Reference error |
| --- | ---: | ---: | ---: | ---: |
| preflop-broad | 1 | 0.6496 | 0.0033 | -0.0039 |
| preflop-narrow | 1 | 0.2910 | 0.0028 | -0.0045 |
| flop-value | 1 | 0.0385 | 0.0014 | -0.0022 |
| flop-draw | 1 | 0.5513 | 0.0035 | -0.0029 |
| turn-known | 1 | 1.0000 | 0.0000 | +0.0000 |
| river-blockers | 1 | 0.6747 | 0.0033 | +0.0080 |
| river-board-tie | 2 | 0.3333 | 0.0000 | +0.0000 |
| river-known-nuts | 1 | 1.0000 | 0.0000 | +0.0000 |
| river-weighted-joint | 2 | 0.6027 | 0.0035 | +0.0027 |
| uniform-2-opponents | 2 | 0.2418 | 0.0030 | +0.0033 |
| uniform-3-opponents | 3 | 0.1441 | 0.0025 | -0.0003 |
| uniform-4-opponents | 4 | 0.0954 | 0.0021 | +0.0026 |
| uniform-5-opponents | 5 | 0.0738 | 0.0018 | +0.0031 |

For the same AK holding, narrowing the preflop hypothesis changed share from
0.6496 to 0.2910 (−0.3587). On the same top-pair flop, the value-heavy and
draw-heavy hypotheses produced 0.0385 and 0.5513 (a 0.5128 difference).
These intentionally contrasting hypotheses show why random-hand equity should
remain separate from conditional range equity. They do not infer what an actual
opponent holds or prescribe a poker action.

## Accuracy and convergence

PokerKit independently checked 12 unweighted fixtures: two tractable river
fixtures were exact, and the remainder used 20,000 accepted independently seeded
samples. Exact blocker share was 2/3; exact known nuts share was 1. Both agreed
with the adapter-based exact enumeration. Board-only two-opponent share was
1/3 in both samplers. The known turn hand won all sampled runouts in both.

The weighted overlapping two-opponent case is independently enumerable by hand:
three compatible tuples have weights 1, 6 and 3, with share 0.6. Its sampled
shares were 0.5950, 0.6002 and 0.6027. Sequential conditional renormalization
would incorrectly produce 0.25. Unit tests also verify a weighted win/loss/tie
case with exact share 1/3.

Every 1,000/5,000/20,000-sample row passed conservative sampling-error-aware
comparison bounds. The largest absolute 20,000-sample reference discrepancy
was 0.0080.
Uniform-range differences from the frozen random-hand calculator were at most
0.0061 across one through five opponents.
These checks support the tested calculations, with no claim that the chosen
ranges are calibrated. Larger budgets need not reduce error monotonically.

| Fixture | 1,000 samples | 5,000 samples | 20,000 samples |
| --- | ---: | ---: | ---: |
| preflop-broad | 0.6610 | 0.6458 | 0.6496 |
| preflop-narrow | 0.2745 | 0.2894 | 0.2910 |
| flop-value | 0.0410 | 0.0419 | 0.0385 |
| flop-draw | 0.5540 | 0.5538 | 0.5513 |
| turn-known | 1.0000 | 1.0000 | 1.0000 |
| river-blockers | 0.6640 | 0.6654 | 0.6747 |
| river-board-tie | 0.3333 | 0.3333 | 0.3333 |
| river-known-nuts | 1.0000 | 1.0000 | 1.0000 |
| river-weighted-joint | 0.5950 | 0.6002 | 0.6027 |
| uniform-2-opponents | 0.2420 | 0.2306 | 0.2418 |
| uniform-3-opponents | 0.1365 | 0.1438 | 0.1441 |
| uniform-4-opponents | 0.1135 | 0.1037 | 0.0954 |
| uniform-5-opponents | 0.0815 | 0.0797 | 0.0738 |

## Latency by opponent count

Median milliseconds across the fixtures in each opponent-count group, including
normalization, feasibility checking and accepted/rejected proposals:

| Opponents | Fixtures | 1,000 samples | 5,000 samples | 20,000 samples |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 7 | 71 | 348 | 1377 |
| 2 | 3 | 112 | 577 | 2679 |
| 3 | 1 | 244 | 1361 | 6617 |
| 4 | 1 | 322 | 1575 | 3140 |
| 5 | 1 | 162 | 1381 | 2975 |

These are single-host, single-run measurements taken alongside regression
checks, so CPU contention affects them. Groups contain different streets and
hypotheses; the table is not an isolated scaling experiment. Seeds are reused
at each budget, making convergence rows correlated. Latency is not a CI gate.

## Limits and next step

Sampling intervals cover bounded fractional showdown-share noise only. Exact
river enumeration removes sampling error, not uncertainty about supplied ranges.
Multiple opponents are sampled jointly conditional on compatibility; independent
range assumptions still need not describe real correlated player behavior.
Equal-pot showdown share is not chip EV across unequal side pots. No automatic
history-to-range inference, action selection, providers, or production integration
was added. This interface can support Plan 2’s separately controlled fixed-decision
range experiment after a later implementation request.

Checks: `npm run check`, offline `npm run test:bots`,
`npm run benchmark:poker-context`, and `npm run benchmark:range-equity`.
The independent oracle was regenerated using the pinned temporary Python environment.
The [reproduction guide](README.md) describes fixtures, distribution, failure
budgets, uncertainty and [PokerKit attribution](README.md#fixtures-baseline-and-independent-validation).
