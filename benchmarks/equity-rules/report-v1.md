# Equity Rules ablation v1 — 2026-10-14

The challenger is not a consistent upgrade. Structured strategy gained against the frozen rules opponent at both populations, but lost against passive opponents at six seats and on easy/medium heads-up. Production policy remains unchanged; these results do not support promoting the combined challenger.

This cost-free run completed **108,000 hand comparisons**, with 500 paired seed blocks in each of 18 opponent/difficulty/population groups and **zero excluded blocks**. Both heads-up assignments and all six six-seat rotations were completed for every variant. The 500 seed values are reused across groups; the 9,000 group-blocks are not 9,000 independent seeds.

See the [protocol](README.md), [compressed synthetic evidence](../evidence/equity-rules-v1-2026-10-14.json.gz), [execution/checksum manifest](../evidence/equity-rules-v1-2026-10-14.manifest.json) and [frozen source manifest](freeze-v1.json). The compressed JSON retains per-hand paired profits, every group summary, fixed decisions and range contrasts; decompress with `gzip -dc` for reanalysis. Earlier evidence is preserved.

## Paired chip differences

Values are **BB per hand**, mean [95% whole-seed-block bootstrap interval]. Positive means the later variant gained more chips. Multiply by 100 for BB/100. Intervals use 2,000 seeded resamples of whole blocks; they are exploratory, without multiple-comparison correction. Heads-up and six-seat results are separate.

### Heads-up

| Opponent | Difficulty | Facts − frozen | Structured − facts | Structured − frozen |
|---|---|---:|---:|---:|
| frozen | easy | -0.196 [-0.736, +0.344] | +4.402 [+3.087, +5.803] | +4.206 [+2.963, +5.519] |
| frozen | medium | +1.400 [+0.460, +2.394] | +1.530 [+0.234, +2.909] | +2.929 [+1.661, +4.242] |
| frozen | hard | +1.482 [+0.523, +2.413] | +0.950 [-0.302, +2.257] | +2.432 [+1.149, +3.712] |
| passive | easy | +0.000 [+0.000, +0.000] | -0.965 [-1.246, -0.648] | -0.965 [-1.246, -0.648] |
| passive | medium | -0.006 [-0.070, +0.049] | -0.360 [-0.614, -0.113] | -0.367 [-0.622, -0.120] |
| passive | hard | -0.006 [-0.070, +0.049] | +0.514 [+0.220, +0.814] | +0.508 [+0.213, +0.809] |
| aggressive | easy | +0.009 [-0.707, +0.730] | +0.110 [-2.217, +2.545] | +0.119 [-2.292, +2.535] |
| aggressive | medium | +0.755 [-0.281, +1.776] | +0.166 [-1.624, +2.071] | +0.921 [-1.128, +3.050] |
| aggressive | hard | +0.831 [-0.201, +1.852] | +0.182 [-1.395, +1.808] | +1.013 [-0.836, +2.805] |

### Six seats

| Opponent | Difficulty | Facts − frozen | Structured − facts | Structured − frozen |
|---|---|---:|---:|---:|
| frozen | easy | -0.088 [-0.288, +0.111] | +2.092 [+1.562, +2.628] | +2.004 [+1.498, +2.513] |
| frozen | medium | +0.134 [-0.199, +0.472] | +1.105 [+0.632, +1.567] | +1.239 [+0.764, +1.714] |
| frozen | hard | +0.038 [-0.296, +0.356] | +1.081 [+0.522, +1.651] | +1.120 [+0.569, +1.630] |
| passive | easy | -0.243 [-0.572, +0.017] | -2.166 [-3.045, -1.367] | -2.408 [-3.374, -1.568] |
| passive | medium | -0.326 [-0.663, -0.045] | -1.701 [-2.449, -0.992] | -2.027 [-2.901, -1.244] |
| passive | hard | -0.265 [-0.615, +0.030] | -1.357 [-2.019, -0.739] | -1.622 [-2.363, -0.930] |
| aggressive | easy | +0.000 [+0.000, +0.000] | +0.000 [+0.000, +0.000] | +0.000 [+0.000, +0.000] |
| aggressive | medium | +0.000 [+0.000, +0.000] | +0.000 [+0.000, +0.000] | +0.000 [+0.000, +0.000] |
| aggressive | hard | +0.000 [+0.000, +0.000] | +0.175 [-0.035, +0.565] | +0.175 [-0.035, +0.565] |

## What helped, hurt or remained uncertain

- **Context/facts corrections:** positive intervals in 2 groups, negative in 1, and overlapping zero in 15. Medium/hard heads-up gains against frozen rules contrast with the medium six-seat loss against passive scripts. Corrections are not automatically a chip-strength improvement.
- **Structured strategy beyond corrected facts:** positive intervals in 6 groups, negative in 5, and overlapping zero in 7. Gains against frozen rules are accompanied by passive-opponent losses. This isolates the strategy bundle from context corrections, but does not isolate its individual stages.
- **Combined challenger versus frozen:** positive intervals in 7 groups, negative in 5, and overlapping zero in 6. Easy/medium six-seat aggressive-script paired profits were identical across variants, despite some different actions; hard had an uncertain difference. This limits that script's ability to discriminate strength; a zero-width interval is not proof of strategic equivalence.

## Actions, sizing and latency

Full frequencies and rule-stage counts are retained per group in the evidence. The table shows the structured candidate's observed behavior. Aggression combines bets and raises; sizing frequencies below are percentages of all decisions, including passive decisions in the denominator.

| Opponent | Difficulty | Seats | Aggression % | Call % | Fold % | 2/2.5/3 BB sizing % | Mean context ms | Mean decision ms | Mean hand ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| frozen | easy | 2 | 21.44 | 30.91 | 6.92 | 0.76 | 2.55 | 0.15 | 25.10 |
| frozen | easy | 6 | 14.84 | 21.76 | 35.09 | 0.33 | 1.59 | 0.09 | 10.81 |
| frozen | medium | 2 | 33.53 | 29.12 | 6.03 | 1.96 | 2.45 | 0.15 | 26.60 |
| frozen | medium | 6 | 23.00 | 21.43 | 32.72 | 0.95 | 1.70 | 0.09 | 13.05 |
| frozen | hard | 2 | 40.48 | 26.96 | 4.52 | 3.87 | 2.58 | 0.10 | 29.89 |
| frozen | hard | 6 | 28.30 | 21.40 | 29.19 | 2.26 | 2.01 | 0.12 | 17.61 |
| passive | easy | 2 | 20.80 | 11.35 | 0.53 | 0.81 | 2.32 | 0.06 | 11.75 |
| passive | easy | 6 | 2.27 | 5.23 | 41.62 | 0.00 | 0.66 | 0.05 | 6.93 |
| passive | medium | 2 | 33.07 | 10.16 | 0.28 | 2.17 | 1.94 | 0.06 | 10.50 |
| passive | medium | 6 | 3.21 | 7.43 | 35.75 | 0.00 | 0.92 | 0.06 | 9.47 |
| passive | hard | 2 | 41.81 | 8.04 | 0.05 | 4.43 | 1.58 | 0.05 | 8.68 |
| passive | hard | 6 | 4.85 | 11.09 | 25.59 | 0.15 | 1.07 | 0.06 | 9.94 |
| aggressive | easy | 2 | 24.03 | 55.34 | 4.80 | 0.56 | 2.78 | 0.11 | 19.04 |
| aggressive | easy | 6 | 0.00 | 23.08 | 76.92 | 0.00 | 0.33 | 0.05 | 31.09 |
| aggressive | medium | 2 | 35.06 | 49.76 | 3.31 | 1.41 | 2.51 | 0.10 | 18.94 |
| aggressive | medium | 6 | 0.02 | 36.10 | 63.87 | 0.00 | 0.16 | 0.04 | 25.19 |
| aggressive | hard | 2 | 42.76 | 44.38 | 1.94 | 2.82 | 1.89 | 0.07 | 14.78 |
| aggressive | hard | 6 | 0.15 | 60.72 | 39.13 | 0.14 | 0.22 | 0.04 | 30.35 |

The match phase took 14.33 minutes with six workers. Context/decision p95, fractional/all-in sizing and other variants' frequencies are in the JSON. Latency reflects concurrent worker execution and bounded memoization of unchanged equity and exact river evaluations. Context timings exclude incremental transition projection, while whole-hand timings include it. These timings do not establish cold production performance.

## Fixed decisions and range sensitivity

The fixed-decision matrix contains **3,546 decisions** across all difficulties, every preflop pot type, positions, 20/150 BB preflop stacks, 20/150 BB multiway stacks, made hands, draws, shared-board strength and two through six seats. Three-, four- and five-player coverage is fixed-decision coverage only, not full matches.

Each variant has 1,182 decisions, including 60 deliberately unknown-history cases. Facts and structured variants used frozen-policy fallback on all 60, while full matches recorded zero fallbacks. The artificial unknown-history proportion is not an estimate of production fallback incidence.

Unit regressions verify free checks, guaranteed river splits, unbeatable hands, capped short calls, non-reopening short all-ins, all-in opponents, genuine hero draw restrictions, hidden-opponent-card invariance, seeded reproducibility and whole-block failure exclusion. Incrementally projected match inputs match complete privacy-safe replay exactly in tests. Passing these checks proves specified mechanics, not GTO or stronger play.

The separate Plan 1 range experiment has **21 heads-up fixed-decision contrasts** (seven supplied hypotheses × three difficulties), at 5,000 samples where Monte Carlo is needed and exact enumeration for tractable river holdings. **10 contrasts changed action or sizing**. Premium preflop and value-heavy flop hypotheses reduced continuation/aggression; draw-heavy flop assumptions changed value raises to calls. These are conditional sensitivity observations, not verified better decisions. The random-equity DTO field stays intact and no supplied range is used in full matches. Uncertainty and provenance accompany every range result.

## Limits and next decision

Random-hand match equity uses 100 samples, versus production's larger default. Policies share identical samples, but coarse estimates can move threshold decisions and may not reproduce a 5,000-sample strength ordering. These are 100 BB, independent, no-rake hands against three heuristic opponents, with 500 blocks per cell and no multiplicity correction. Three through five players have no match-strength estimate, and overall showdown share is not side-pot chip EV.

Keep production unchanged. A later experiment can separately ablate opening size, value gates and semi-bluff restrictions, then repeat promising comparisons with larger equity budgets and additional opponents. The current bundled candidate loses in several measured cells; do not hide those losses by changing strategic expectations or promoting only its favorable matchups.

Validation: `npm run check` (1,725 tests), offline `npm run test:bots` (60 passed; live groups skipped), `npm run benchmark:poker-context` (2 passed; live test skipped), and `npm run benchmark:equity-rules` all passed. Build/SQL checks were outside scope because no application, schema, routing or deployment behavior changed. No provider requests were made.
