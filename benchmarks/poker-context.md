# Shared context and selective LLM guidance

Production defaults use `typesafe-poker-v3.0` and
`llm-poker-v3.1-guided-{balanced|tight|aggressive}`. The analysis and advisory
library are independently versioned as `poker-facts-v1` and `poker-advice-v1`.
There is one provider request per decision. Equity Rules' strategy code is
unchanged; production retains its legacy fractional sizing.

## Context and privacy

Apply `20261013000000_add_bot_hand_context.sql` before the application release.
The additive RPC is service-role-only, reads one game/hand and its ordered
pre-action states in one SQL statement, and needs no backfill. It never joins
actors to mutable names. Repository parsing validates the envelope and states;
empty legacy states or gaps give an explicit unknown classification. Database
errors remain visible. A version or complete replay mismatch returns the usual
conflict before inference. Replay validates successive engine states, resolves
each actor from the authoritative turn and immutable initial configuration,
and sends only seats, actions, payments, commitments, pot sizes and street
participant lists. Private states, decks, tokens and opponent cards never enter
provider requests. Full projected factual history accompanies summaries.

Positions come from dealt participants, including folded players; empty and
sitting-out seats are excluded. Four-handed first position is cutoff and
five-handed first position is hijack. Heads-up button also posts the small blind,
acts first preflop and last postflop. Street orders and pending actors are
explicit. Preflop classification counts calls and aggression, ignoring folds;
short all-in raises remain aggression even when they do not reopen betting.

The live pot includes all commitments. Contestable pot after a stack-capped
call excludes chips above HERO's contribution cap and single-contributor layers.
Effective stacks are remaining stacks capped against each non-folded opponent;
the headline uses the largest opponent cap, and SPR divides it by the live pot.
These quantities are separate, especially around side pots. Raise sizes are
street totals; payment is total minus HERO's existing street commitment. Calls
are included in that payment once. Both providers share opening raises to
2/2.5/3 BB in known unopened pots, fractional-pot sizes elsewhere, engine clamps,
deduplication and an explicit maximum commitment.

Card facts use the installed engine evaluator behind the adapter and independent
rank-window/suit analysis, not Equity Rules' approximate draw helpers. The
best-five rank and tiebreak vector identify made ranks/kickers and board-only
strength. One-card straight completions include wheels; flop backdoors require
two cards, and river draws are suppressed. Blockers are visible card-removal
facts, never known opponent ranges. Individual bet/raise pressure events use
increment above the call divided by pot after calling; calls are not pressure.
Street totals are descriptive sums, not equity or calibrated strategy scores.

Advice is original qualitative text selected by street, position, hand
properties, pot type, action lines, pressure and opponent count. Heads-up
patterns require known history, two current participants and two participants
through the relevant street. Six-seat preflop remains six-seat even after folds.
Multiway advice accounts for multiple continuing ranges and limited fold equity.
Unknown situations get general advice. Advice never removes candidates and
cannot override the existing exact river safeguards or playstyle boundaries.
The supplied context and advice IDs/text are persisted in existing private audit
storage; existing inspection/public DTO restrictions still apply.

## Offline evidence

```sh
npm run check
BOT_SCENARIO_LIVE=false npm run test:bots
npm run benchmark:policy
npm run benchmark:poker-context
npm run test:sql:bot-context
NEXT_DIST_DIR=.next-context-check npm run build
```

The new default benchmark explicitly disables live runs even when `.env.test`
contains live flags. It exercises production Jev and LLM wrappers with local
mock responses over all 169 hand classes. Pairs/suited/offsuit classes have
6/4/12 weights (1,326 combinations). Eleven nodes cover six-seat openings from
every non-BB position, button/BB facing UTG raises, heads-up opens/defends,
limped and re-raised pots. Two decisions per cell measure exact move agreement.
Reports contain weighted action/sizing frequencies by node (including positional
differences), failure counts, mean/p95 latency, policy versions, available usage
and cost, and individual rows. Offline matrix contexts use five equity samples
for speed; they verify wiring and legal arithmetic, not strategy or equity
accuracy. Full-hand comparisons use 100 equity samples, paired seeded deals,
seat-swapped heads-up and all six subject-seat rotations.

`benchmarks/results/poker-context-offline.json` contains the detailed generated
report. Results are ignored by Git. The frozen v2.1 context and provider policies
in `benchmarks/baselines/` are benchmark-only; production never imports them.
LLMs compare baseline, corrected facts, and facts plus guidance. Jev compares
baseline and corrected facts because it receives no strategy guidance.

Offline provider outputs are scripted. Legal actions, deterministic agreement,
chart frequencies and confidence intervals here **do not establish playing
strength**. No hand-written chart is treated as GTO ground truth. A future chart
comparison must label its range source as a descriptive reference. Random-hand
equity is not betting-range equity.

## Explicit capped live evidence

No paid run or deployment is part of this implementation. To deliberately run
live, supply credentials via existing environment configuration and a decision
cap shared across every variant, model, playstyle and repetition:

```sh
EXTERNAL_INFERENCE_ENABLED=true BOT_DECISION_CALL_CAP=100 \
  npm run benchmark:poker-context:live
```

The cap is a maximum, not a request to spend exactly that many calls. The full
matrix is much larger than this example cap; exhaustion stops before the next
request and fails visibly. Completed reports and partial rows are saved to
`benchmarks/results/poker-context-live.json`. Failed provider decisions are
recorded without fallback. `BOT_EVAL_REPETITIONS` defaults to two. Live matrix
contexts use production's 5,000 equity samples. LLM models/reasoning come from
`LLM_BOT_MODELS`, covering all three playstyles. Jev retains medium difficulty
and its complete-move contract. Model, variant/policy, playstyle, seeds,
repetitions, rotations and provider usage/cost are recorded.

Full-hand reports compare variants against Equity Rules with paired seed means.
Each seed averages rotations and repetitions; those seed means, rather than
correlated individual hands, are the uncertainty units. Reports include normal
approximation 95% intervals for facts-minus-baseline, guidance-minus-baseline
and guidance-minus-facts. Fewer than two paired seeds yield no interval; small
samples and a single offline opponent limit interpretation. These matches are
not a solver benchmark or evidence of broad six-seat strength.

Existing `test:bots` live groups and `benchmark:typesafe:live` also require
`BOT_DECISION_CALL_CAP` and explicit inference enablement. The SQL runner uses
rolled-back fixtures in the local Docker database, checks ordering, roles and
cross-game/hand isolation, and never loads `.env`, resets the DB, or calls a bot.
CI runs it after applying migrations alongside the existing integration checks.

## Research attribution

[PokerSkill](https://arxiv.org/html/2605.30094v1) motivated deterministic analysis
plus selective guidance. Its reported benchmark is heads-up and reports losses
against GTOWizard; it does not establish six-seat strength. We adapt the approach
without importing its implementation, tables, numerical attack/defense budgets,
or non-commercial code. See its [repository license](https://github.com/lbn187/PokerSkill#license).
[jev-preflop-poker](https://github.com/marcbara/jev-preflop-poker) motivated
weighted starting-hand chart reporting; no reference ranges are copied.
