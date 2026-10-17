# Restricted river lookahead (offline)

This benchmark compares conditional river **root actions** against current
`OpeningAwareEquityRulesBot`. It does not change production strategy, sizing,
providers, context preparation, calculator contracts or historical evidence.
No inference, database, application server or environment-file loading occurs.

```sh
npm run benchmark:river-lookahead -- smoke  # frozen input verification; no writes
npm run benchmark:river-lookahead -- full   # exact matrix and immutable evidence/report
```

Node 24+ is required. The coordinator starts a worker with an explicit two-variable
environment and no inherited Node arguments; credentials and preload options are
excluded. The worker blocks fetch, HTTP(S), TCP and TLS connections. It uses the
existing benchmark TypeScript module hook, never Vitest's environment loader.
The full run is deliberately small (36 baseline decisions, 252 assumption rows),
not a match simulation. The smoke covers one fixture/difficulty/assumption.

`freeze-v1.json` contains the **expanded explicit** cards, complete public action
transcripts, ranges, holding/size response tables, configuration and source
SHA-256 hashes. It was written before collecting the recorded baseline decisions.
`freeze` is a development preparation command that refuses to overwrite a freeze.
The evaluator and baseline share the authoritative engine replay, but hero inputs
contain only hero cards and public history. `actualOpponent` is a replay fixture
property, outside the strict decision schema. Changing it cannot change production
hero context or a decision from unchanged assumptions. Burn cards and unseen deck
cards are generated solely to construct engine replays and never enter contexts.

The full command verifies the expanded inputs and source set before running and
rechecks sources afterward. It writes `evidence-v1.json` and `report-v1.md` using
exclusive creation; it never overwrites completed evidence. For reproduction,
copy the repository to a separate checkout, retain the freeze and source files,
remove only that copy's two output artifacts, then run `full`. Compare substantive
JSON fields; runtime and Node version are descriptive metadata. Source edits require
a new experiment version and freeze; do not update old evidence to fit new code.
The source manifest includes all application TypeScript, engine code, the shared
calculator/showdown helper, module hook, experiment sources/tests and lockfile.

## Restricted domain and value accounting

`evaluate` accepts a schema-checked public river decision, a provenance-tagged
weighted range, a versioned explicit response table and legal candidates. It
returns `supported` with per-action EV in BB, branch probabilities/posteriors,
exact conditional showdown shares, continuation values and provenance, or
`unsupported` with a reason. It rejects invalid cards/ranges/probabilities,
incomplete or mismatching history, illegal candidates, non-river/non-heads-up
states, rake, side pots, earlier unequal contributions and unsupported root nodes.
Initial blind posting and every action are replayed through the adapter.

The supported roots are a checked-to, last-to-act hero and a hero facing an
opponent all-in. The first permits check and current production bet amounts;
the second permits fold/call. The runner deduplicates actual type/amount pairs
and adds the legal Rules action if absent. It uses the current menu without
quarter-pot or overbet additions. Current all-in sizing remains available.
Unused legacy sizes have explicit response rows to cover a possible baseline
root without expanding the evaluated menu.

Checking goes to showdown. Bets receive fold/call/all-in-raise responses.
Positive probability on an illegal raise is rejected; non-all-in raises are
not modeled. On a raise, hero chooses fold or call **once against the entire
posterior**, then that same continuation applies to every holding. No
clairvoyant per-holding choice occurs. Zero-mass branches are absent. Visible
blockers are removed before normalization, and each response reweights the
range independently; empty or invalid ranges never receive a uniform fallback.

The existing calculator enumerates each nonempty showdown branch exactly.
The engine separately executes terminal actions for each compatible holding.
Final hero stack minus the stack immediately before the root decision gives
EV; earlier contributions are sunk. This accounts for new bet losses on folds,
stack-capped calls, ties and uncalled refunds. Every terminal verifies total
chip conservation. Baseline roots use the identical optimal modeled continuation,
so this is a **root-action comparison**, not a full Rules-policy simulation.

## Original synthetic construction

All 12 fixtures use an engine-validated heads-up line: button raises to 10 chips,
big blind calls; big blind checks flop, button bets 10, big blind calls; both
check turn. On the river big blind either checks or shoves. Blinds are 1/2;
initial stacks alternate 120/80 and 80/120. Thus the root pot is 40 chips (20 BB),
and both directions of unequal effective stacks/refunds are covered.

Eight checked-to boards cover value, thin value, bluff catching, missed draws,
blockers, paired boards, coordinated boards and board-only forced splits.
Four all-in boards cover certain wins, splits, certain losses and marginal calls.
Labels describe fixture intent, not a solver classification.

Each range is an explicit **post-observed-line** hypothesis, including the final
check or shove. Six canonical holding representatives span the available
public made-hand categories: enumerate unblocked holdings, sort by own category
then canonical card order, and select indices floor(i*(N-1)/5), i=0..5. The certain
loss fixture excludes high-card holdings. Broad weights are 1/1/1/1/1/1;
value-heavy weights are 1/1/2/4/8/16; polarized weights are 12/6/1/1/6/12.
These are sparse, deliberately artificial sensitivity hypotheses, not realistic
full population ranges or ranges inferred from hero outcomes/session statistics.

For checked-to fixtures, every range is crossed with all three profiles. A holding
is synthetically "strong" if its own public made-hand category is two-pair or
better. Pressure means a bet of at least the 40-chip root pot. Fold-prone assigns
fold probability .10 to strong holdings and .80/.65 to other holdings at high/low
pressure. Call-heavy uses .02 and .20/.10. Raise-capable uses .05 and .55/.35;
its raise probability, when an all-in raise is legal, is .65 for strong holdings
and .15/.30 for others at high/low pressure. Other profiles never raise. Calls
receive the residual probability. No response rule reads hero private cards:
only the opponent holding, public board, public stack legality and bet size enter
these formulas. Expanded probabilities, not callbacks, are supplied to evaluation.
No VPIP/PFR/fold-statistic calibration occurs. Facing-all-in roots cross only
three range hypotheses because the preceding shove is already observed.

## Baseline and evidence

The production context mirrors `bot-turn-service.ts`: legacy projected history,
`correctedContext: false`, `createLegacySizingOptions`, all three difficulties,
and the unmodified default 5,000 equity budget. One decision per visible
fixture/difficulty is recorded and reused across all hidden assumptions.

The evidence includes all 252 maximizing actions and EV differences against
Rules; every selected action is cross-evaluated against every other assumption
for the same fixture/difficulty (2,052 ordered pairs). It also identifies actions
strictly better than the baseline across **every supplied assumption**, their
minimum/maximum conditional improvement and distinct complete rankings. EV ties
break deterministically by action key; raise continuation ties choose call.

Run `npm run check`, `npm run benchmark:range-equity`, smoke and full for
verification. No build or SQL changes are involved. The focused tests cover
hand arithmetic, thresholds, posterior weighting, blockers, empty branches,
invalid probabilities, raises, ties/refunds, chip conservation, range/suit order,
replay, hidden-card invariance, duplicate sizes and unsupported states. Existing
production exact-river/provider tests remain part of `check`.

See [the recorded report](report-v1.md). Synthetic assumptions, restricted raises,
fixed river decisions and absence of measured provider/real-world strength are
material limits. Exact enumeration removes sampling error conditional on those
assumptions; it does not remove opponent uncertainty. Sensitivity spans are not
statistical confidence intervals, GTO or exploitability measurements. Production
integration, Jev/LLM pilots or shared Eevo changes require a separate evidence-based plan.

The report includes authored interpretation and verification notes in addition
to the reproducible generated tables. Forced-split gains are synthetic-fold
artifacts and cannot support relaxing safeguards. The frozen marginal fixture
stays profitable under all supplied ranges; the hand-calculated threshold test
separately covers a call/fold reversal. Neither finding was used to retune the
frozen hypotheses after collecting baseline decisions.

Recorded runtime measures the evaluation itself, excluding worker startup and
expanded-input regeneration. A second isolated full evaluation reproduced every
substantive evidence field exactly, without replacing the recorded artifacts.
