# Conditional range-equity experiment (Plan 1)

This benchmark estimates **equal-pot showdown share conditional on supplied
weighted holdings**. It does not infer ranges from history, estimate fold equity,
measure playing strength, or compute chip EV across unequal side pots. The
fixtures are original sensitivity hypotheses, not solver-certified/GTO ranges.
Production bots, prompts, selection, inference, persistence and public contracts
are unchanged. No PokerSkill code, tables or strategy text is reused.

## Run and reproduce

```sh
npm run benchmark:range-equity
```

This offline command checks against the committed PokerKit reference, runs each
fixture at 1,000, 5,000 and 20,000 accepted samples, and compares uniform ranges
with the frozen random-hand baseline. It writes synthetic fixture inputs and a
JSON report to ignored `benchmarks/results/`. It makes no provider calls. Fixed
fixture seeds are reused at each budget, so convergence rows are correlated;
latencies are single-run measurements, not stable performance guarantees.

Regenerate the independent reference in an isolated Python environment:

```sh
python3 -m venv /tmp/ai-holdem-range-pokerkit
/tmp/ai-holdem-range-pokerkit/bin/pip install -r benchmarks/range-equity/requirements.txt
POKERKIT_PYTHON=/tmp/ai-holdem-range-pokerkit/bin/python npm run benchmark:range-equity
```

Installation needs network access; calculations are offline. Python 3.11+ and
exactly PokerKit 0.7.7 are required. Python is outside the application runtime.
The optional environment variable names a Python executable (no shell command).
The runner verifies the full exported fixture SHA-256 against the oracle, so a
changed hypothesis cannot silently reuse old reference results. To freeze a new
version, preserve the new oracle and report under new versioned filenames; do
not overwrite earlier evidence.

Run `npm run check`, `BOT_SCENARIO_LIVE=false npm run test:bots`, and
`npm run benchmark:poker-context` for the existing offline safeguards. No SQL or
Next.js build changes are involved. A benchmark-owned showdown helper compares category/kicker projections from
the adapter's existing visible-card evaluator; the adapter itself stays unchanged
to preserve prior experiment hashes.

## Interface and distribution

`calculateRangeEquity` accepts two hero cards, a 0/3/4/5-card board, 1–5 opponents,
one provenance-tagged explicit weighted combination range per opponent, a seed,
and a sample budget (2–100,000). Invalid cards, repeated visible cards, duplicate
unordered combinations (including zero-weight duplicates), negative/non-finite
weights and empty effective ranges throw. Positive finite weights need not sum
to one; zero weights are ignored and visible blockers removed before normalization.
Numerically unrepresentable normalized/joint weights are rejected.

The target probability of a compatible tuple is proportional to the **product**
of its weights. Independent draws from each normalized range followed by rejection
of the entire colliding tuple implement this distribution. Opponents are never
sequentially reweighted against already sampled holdings. Ranges and combinations
are canonically ordered for seeded opponent-order invariance. Future board cards
are uniformly sampled without replacement from the remaining deck.

Automatic mode enumerates all compatible river tuples when the post-blocker
Cartesian product contains at most 50,000 tuples. Its share is exact (apart from
floating-point arithmetic), with zero sampling uncertainty; `sampleCount` counts
compatible enumerated tuples, not random observations. Other cases use seeded
Monte Carlo. Explicit `mode: "monte-carlo"` permits comparisons to exact truth.

Monte Carlo returns the fractional-share sample standard error and a conservative
95% Hoeffding interval, clipped to [0,1]. This interval measures sampling error
only; it says nothing about whether the assumed ranges describe actual players.
In particular, zero observed variance does not prove zero uncertainty.

Attempts default to `min(100 × sampleBudget, 2,000,000)` and can be explicitly
bounded at 1–2,000,000. Each independent tuple proposal counts as an attempt.
If fewer than the requested samples complete, the result is `unsupported` with
accepted sample/attempt counts and **no equity estimate**. A separate feasibility
search is capped at 100,000 visited candidates. Proven impossible joint ranges
throw; larger searches that cannot establish feasibility proceed to bounded
rejection sampling and may return unsupported rather than claiming impossibility.
Exact enumeration uses its own fixed tractability bound and ignores the Monte
Carlo attempt budget. Provenance is returned in canonical opponent order.

## Fixtures, baseline and independent validation

`range-hypotheses-v1` covers broad/narrow preflop holdings; value-heavy/draw-heavy
flop holdings; known turn/river hands; visible blockers; a board-only tie;
weighted overlapping multiway ranges; and uniform ranges with two through five
opponents. Multiway and heads-up rows are reported separately by opponent count.
The weighted river fixture has three compatible tuples with masses 1, 6, 3:
hero wins only the mass-6 tuple, yielding 0.6. Sequential normalization instead
produces 0.25. Unit tests compare seeded samples to the exact product-weight result.

`benchmarks/baselines/random-equity-v1.ts` is an unchanged copy of
`lib/poker/equity.ts` at experiment creation. This freezes the random-hand
calculation and PRNG without changing the existing production equity field. The
report records its SHA-256, fixture hash, Node version and pinned engine version
1.0.1. Production context preparation is not used or changed by this experiment:
the input contains only explicit hero/board cards and supplied assumptions.
Hidden opponent cards are not an input, and no game/history access occurs.

The independent Python oracle evaluates holdings using PokerKit's
`StandardHighHand.from_game`. It enumerates tractable unweighted river cases;
elsewhere it draws independent unweighted tuples, rejects collisions, and uses
20,000 accepted samples with a separate Python PRNG/seed. It reports fractional
shares and standard errors. Weighted sampling is validated separately against
exact enumerable tests, rather than pretending PokerKit's unweighted ranges
support weights. Comparison tolerances combine conservative bounded-sampling
errors and allow baseline rounding; passing them is a regression check, not a
certificate of general accuracy.

[PokerKit](https://github.com/uoftcprg/pokerkit) is used as an installed independent
evaluation dependency (MIT license), not copied source or strategy data. See its
[hand evaluation documentation](https://pokerkit.readthedocs.io/en/stable/evaluation.html)
and the [pinned release](https://pypi.org/project/pokerkit/0.7.7/).

See the [recorded sensitivity report](report-v1.md) for measured results and limits.
Automatic range inference and production integration require later plans.
