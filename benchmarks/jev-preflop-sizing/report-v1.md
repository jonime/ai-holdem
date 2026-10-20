# Jev AA/KK opening-size study v1 — completed development report

**Defer, retaining current production behavior.** No smaller size qualified for either AA or KK. The frozen selection is empty; confirmation correctly allocated and simulated zero blocks. There is no confirmed candidate or authorization for a Jev intervention, provider spending or an automatic action override.

## Evidence and verification

The user completed the manual commands. Reanalysis validated the frozen source, Node/configuration/allocation, source bundle, mechanical gate, 192 checkpoints, immutable development archive and selection binding without rerunning study arms or continuation decisions. All 24 strata per hand have four completed deals: 96 blocks for AA and 96 for KK, with 192 distinct deck hashes and **4,608 completed rollouts, zero failures or replacements**. The longest observed continuation used 16 actions, below the 200-action limit. Terminal stacks conserve 400 chips. Shove outcomes match across hero continuations, and first opponent responses match across hero continuations within every paired block. See [verification](verification-v1.json).

The motivation remains eighteen historical requests (nine AA, nine KK) with reported model jev-1.13.0, configured alias jev-latest, medium typesafe-poker-v4.1-confidence. They are HU button/small-blind openings with equal 100-BB stacks, blinds 0.5/1 BB and no preceding voluntary action. A 100-BB raise commits 200 total chips, paying 199 after the small blind. Saved input/source/evidence hashes and regression fixtures are in [motivation-v1.json.gz](motivation-v1.json.gz). These historical observations remain motivation, not new samples or a claim about the current remote model.

## Paired development differences

Values below are **smaller opening minus shove, BB per conditioned deal**. Brackets are descriptive 95% intervals from 20,000 seeded stratified whole-deal-block bootstrap resamples. Each cell has 96 paired deals, not 576 independent observations. Opponents and hero continuations are offline substitutes; neither hero policy is Jev.

AA

| Opponent / hero continuation | 2 BB | 2.5 BB | 3 BB |
| --- | ---: | ---: | ---: |
| rules / rules | +19.36 [+10.05, +28.66] | +18.57 [+9.15, +27.93] | +21.02 [+12.34, +29.46] |
| rules / conservative | -20.26 [-27.63, -12.90] | -18.80 [-26.04, -11.53] | -16.03 [-23.28, -8.78] |
| selective / rules | +5.16 [+1.03, +9.28] | +5.16 [+1.03, +9.28] | +5.16 [+1.03, +9.28] |
| selective / conservative | -0.31 [-1.86, +1.09] | +0.15 [-1.19, +1.48] | +0.67 [-0.55, +2.06] |
| loose / rules | +15.62 [+9.30, +22.11] | +16.55 [+10.29, +23.71] | +16.57 [+10.29, +23.72] |
| loose / conservative | -2.52 [-6.01, +0.56] | -1.69 [-4.97, +1.19] | -0.56 [-3.66, +2.21] |

KK

| Opponent / hero continuation | 2 BB | 2.5 BB | 3 BB |
| --- | ---: | ---: | ---: |
| rules / rules | +6.10 [-5.31, +17.51] | +8.69 [-3.19, +20.57] | +10.96 [+0.30, +21.70] |
| rules / conservative | -10.25 [-17.61, -2.81] | -9.45 [-16.63, -2.26] | -8.08 [-15.02, -1.15] |
| selective / rules | -0.02 [-2.12, +2.06] | -0.02 [-2.12, +2.06] | -0.02 [-2.12, +2.06] |
| selective / conservative | +0.80 [-0.52, +2.30] | +0.74 [-0.65, +2.26] | +0.69 [-0.77, +2.18] |
| loose / rules | +8.75 [+1.14, +16.85] | +8.88 [+1.25, +16.94] | +9.07 [+1.39, +17.08] |
| loose / conservative | +1.27 [-1.29, +3.91] | +0.83 [-1.81, +3.46] | +1.44 [-1.23, +4.14] |

Every size has a negative paired mean against Rules when hero uses the conservative continuation. Thus every size fails the required positive mean in all six cells, regardless of descriptive interval endpoints. KK also has a slightly negative mean (−0.021 BB) against the selective opponent with Rules continuation at all three sizes. No alternative was selected after observing these results.

The contrast demonstrates continuation sensitivity: against Rules, a Rules hero can build larger pots after a smaller opening, while a conservative hero never bets or raises and realizes less value than the forced all-in arm in this sample. This is an interpretation of these controls, not evidence that shoving is optimal for Jev. The selective opponent also continued rarely: AA shove calls 2/96 versus small-open calls/re-raises 7/96; KK shove calls 1/96 versus small-open continues 3/96. Sparse high-impact outcomes limit conclusions about those synthetic ranges.

## Returns, losses and response metrics

Full per-hand/per-cell/per-arm mean returns, root response counts and frequencies, flop/showdown frequencies, later chip payments, worst terminal returns, worst paired differences and stratum counts are preserved in [analysis-v1.json.gz](analysis-v1.json.gz). Hero later payments exclude the root; opponent payments include the first response. They are gross action payments; refunds and awards enter terminal returns.

Worst observed terminal return is −99.5 BB, reflecting the pre-root stack of 199 chips. Worst paired smaller-minus-shove difference is −101 BB for both holdings. These are observed deal outcomes, not loss bounds or whole-range estimates.

## Confirmation and limitations

[The frozen selection](selection-v1.json) is empty. The completed [confirmation archive](confirmation-v1.json.gz) therefore contains no rows. No adjusted confirmation intervals or confirmation-pass claim exist. The planned twelve-comparison confidence rule 1 − .05/12 remains unchanged; no controls, sample sizes, evaluated population or qualification gates were altered.

The result is conditional on current medium Rules, the conservative control, synthetic first-response ranges, 5,000-sample random-opponent equity and the sampled AA/KK deals. Bootstrap coverage is approximate. It establishes neither actual Jev returns, GTO values nor proven playing-strength improvements. There is no whole-range or BB/100 extrapolation. The study does not prove that Jev should keep shoving; it does not meet the predeclared gate to shortlist a smaller size.

Preserve [development evidence](development-v1.json.gz), all original local block checkpoints, the source bundle and freezes. Reanalysis needs no study rerun. See [the guide](README.md) for methodology and recovery.
