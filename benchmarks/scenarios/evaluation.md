# Everyday Equity Rules baseline

The expanded suite ran repeatedly offline on revision
`f336989e699d819367f04a98e0940c77e9ef0259` plus the scenario changes in this working
tree. No production strategy or context code changed. The initial and final runs passed 60/60
checks: twenty fixtures at easy, medium and hard. External provider groups were
skipped. [Per-decision records](equity-rules-baseline.json) capture actions and
amounts, matched rules, sizing labels, sampled equity, call costs, contestable
pots and grading outcomes. Samples and sizing now match production; this is a
new baseline, not a playing-strength comparison with the old 500-sample harness.

Medium is the Quick Play product case. Its everyday decisions were:

| Fixture | Action (chip amount) | Matched rule |
| --- | --- | --- |
| Unopened six-seat | Fold | rules-fold |
| Facing open with 88 | Raise to 10 | rules-value-bet |
| Multiway raised suited connector | Call 6 | rules-call |
| Short-stack ace-high | Fold | rules-fold |
| Flop free check | Check | rules-check |
| Flop top pair facing bet | Raise to 6 | rules-value-bet |
| Flop flush draw facing bet | Raise to 8 | rules-value-bet |
| Flop multiway middle pair | Raise to 10 | rules-value-bet |
| Turn completed flush | Raise to 8 | rules-value-bet |
| Turn missed draw | Fold | rules-fold |
| Turn short unmatched call | Call 6 | rules-call |
| Turn multiway side pot | Raise to 30 | rules-value-bet |

The short caller pays 6 into a contestable 24, despite 206 in live commitments.
The multiway fixture includes an all-in opponent and hero eligibility in both
main and side pots: call 20, contestable pot after call 70. These engine-backed
facts validate harness/context arithmetic. No reproducible Rules arithmetic bug
or clearly dominated new decision was demonstrated. Original river invariants
remain satisfied across all difficulties.

The early-position AJs fold and aggressive medium-pair/multiway raises are
informational concerns worth studying with ranges and more positions. Random-hand
equity, a single deterministic sample, and these fixtures cannot prove that such
choices are wrong or profitable. No new hard failure is assigned to them.

There is no before/after strategy correction: the responsible strategy stayed
unchanged, so no correction regression or neighboring counterexamples were
needed. The before and final offline runs agreed on all grading outcomes. Proven
changes are broader reproducible state coverage, production-equivalent inputs,
hidden-card independence, and separation of legality/provider/invariant results.
Passing does not establish overall strength; opponent ranges, frequency quality,
sizing quality and sustained multiway performance remain unmeasured.
