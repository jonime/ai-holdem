# Restricted river lookahead v1

Manifest SHA-256: 7d263c735f1caf7d63f4d73a6001039943a7307af0eafd9fe74dc79e72069a41. Node v24.21.0; poker-engine 1.0.1.

This is a **root-action comparison** against production OpeningAwareEquityRulesBot at its default budget, with the same posterior-optimal fold/call continuation for all roots. It is not a simulation of the complete Rules policy.

36 baseline decisions reused across 252 assumption combinations. Runtime 22.31 seconds; 9720 conditional holding enumerations (repeated across actions/branches); 0 unsupported cases; 0 validation failures. Zero-mass branches are absent.

174 combinations improve on the baseline; mean conditional improvement 1.8105 BB. Maximum cross-assumption regret 16.9667 BB; worst selected-action difference from Rules -11.0150 BB.

| Fixture | Difficulty | Distinct rankings | Actions strictly improving across every supplied assumption (minimum BB) |
|---|---|---:|---|
| value | easy | 7 | None; no robust strict improvement established |
| value | medium | 7 | None; no robust strict improvement established |
| value | hard | 7 | None; no robust strict improvement established |
| thin-value | easy | 7 | None; no robust strict improvement established |
| thin-value | medium | 7 | None; no robust strict improvement established |
| thin-value | hard | 7 | None; no robust strict improvement established |
| bluff-catching | easy | 7 | None; no robust strict improvement established |
| bluff-catching | medium | 7 | None; no robust strict improvement established |
| bluff-catching | hard | 7 | None; no robust strict improvement established |
| missed-draw | easy | 6 | None; no robust strict improvement established |
| missed-draw | medium | 6 | None; no robust strict improvement established |
| missed-draw | hard | 6 | None; no robust strict improvement established |
| blocker | easy | 6 | None; no robust strict improvement established |
| blocker | medium | 6 | None; no robust strict improvement established |
| blocker | hard | 6 | None; no robust strict improvement established |
| paired | easy | 6 | None; no robust strict improvement established |
| paired | medium | 6 | None; no robust strict improvement established |
| paired | hard | 6 | None; no robust strict improvement established |
| coordinated | easy | 3 | bet:27 (0.6125); bet:100 (0.5000) |
| coordinated | medium | 3 | bet:27 (0.6125); bet:100 (0.5000) |
| coordinated | hard | 3 | bet:27 (0.6125); bet:100 (0.5000) |
| forced-split | easy | 1 | bet:13 (0.2000); bet:20 (0.2000); bet:27 (0.2000); bet:40 (0.2000); bet:60 (0.2000) |
| forced-split | medium | 1 | bet:13 (0.2000); bet:20 (0.2000); bet:27 (0.2000); bet:40 (0.2000); bet:60 (0.2000) |
| forced-split | hard | 1 | bet:13 (0.2000); bet:20 (0.2000); bet:27 (0.2000); bet:40 (0.2000); bet:60 (0.2000) |
| all-in-win | easy | 1 | None; no robust strict improvement established |
| all-in-win | medium | 1 | None; no robust strict improvement established |
| all-in-win | hard | 1 | None; no robust strict improvement established |
| all-in-split | easy | 1 | None; no robust strict improvement established |
| all-in-split | medium | 1 | None; no robust strict improvement established |
| all-in-split | hard | 1 | None; no robust strict improvement established |
| all-in-loss | easy | 1 | None; no robust strict improvement established |
| all-in-loss | medium | 1 | None; no robust strict improvement established |
| all-in-loss | hard | 1 | None; no robust strict improvement established |
| all-in-marginal | easy | 1 | None; no robust strict improvement established |
| all-in-marginal | medium | 1 | None; no robust strict improvement established |
| all-in-marginal | hard | 1 | None; no robust strict improvement established |

The machine-readable evidence contains every baseline context, branch posterior/probability/equity, continuation alternatives, action EV and complete cross-assumption matrix. Distinct rankings and negative cross-assumption differences identify decisions requiring better opponent information. See README for synthetic construction and reproduction.

These original ranges and responses are synthetic post-line hypotheses, not inferred player behavior. Only check/bet and facing-all-in roots are covered; raises are restricted to opponent all-in, with optimal hero fold/call. Decisions are fixed rivers, with no rake or side pots. Effective stacks, ties and refunds use engine terminal payouts. Prior contributions are sunk. No measured provider or real-world playing-strength improvement is established. Exact enumeration removes sampling error conditional on assumptions; opponent uncertainty remains. Sensitivity spans are not confidence intervals, GTO values or exploitability measurements. No paid calls or production strategy/provider changes occurred. Jev, Eevo, LLM integration and live evaluations require a separate evidence-based plan.

## Interpretation and verification

The coordinated-board fixture is the useful follow-up candidate within this
restricted model: bet-to-27 improves on Rules' bet-to-20 by at least 0.6125 BB
across all nine supplied assumptions, at every difficulty. The root all-in also
improves by at least 0.5 BB. These are conditional model results, not grounds for
promotion. In contrast, most other checked-to fixtures have six or seven distinct
rankings and no single strict improvement across all supplied assumptions.

Forced-split betting gains of 0.2–1 BB arise entirely from synthetic opponents
folding a guaranteed split. They expose an implausible assumption in these
profiles and must not justify removing the production forced-split safeguard.
The facing-all-in fixture named `all-in-marginal` remains a profitable call under
all three frozen hypotheses (10–36.6667 BB); the dedicated correctness test,
rather than that fixture, establishes the range-sensitive call/fold threshold.
Future experiments should preregister tighter near-threshold hypotheses rather
than treating these sparse ranges as population calibration.

`npm run check` passed: 151 files, 2,158 tests, including all ten new focused
correctness/privacy tests. Smoke passed without writes. Full execution took
22.31 seconds. The operator ran `npm run benchmark:range-equity` and reported
a pass, supplying all 39 fixture/budget rows (1,000, 5,000 and 20,000 samples).
This closes the remaining verification item. No build or SQL checks were needed
because application and schema files are unchanged.

A second isolated, non-writing full evaluation matched every recorded baseline
context/action, posterior, branch/action value, robustness row and cross-assumption
result exactly. Manifest and all 259 frozen source hashes were verified again.
Reported runtime measures evaluation after worker startup and input regeneration.
