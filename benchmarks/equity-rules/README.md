# Equity Rules situation experiment (Plan 2)

This benchmark implements `PokerBot` candidates without registering them in the
application. It never resolves providers, queries session history or changes
production policy, models, prompts, persistence or public contracts.

```sh
npm run benchmark:equity-rules
# Short mechanics run; not the planned evidence sample:
RULES_BLOCKS=2 npm run benchmark:equity-rules
# Deliberate sensitivity rerun with more precise random-hand estimates:
RULES_EQUITY_SAMPLES=1000 npm run benchmark:equity-rules
```

Node 24+ is required. The default is 500 seeded blocks per opponent, difficulty
and population, with 100 random-equity samples per decision (the existing offline
match harness budget). Two-seat blocks contain both subject seats; six-seat blocks
contain all six subject-seat rotations, each for all three variants. This totals
108,000 completed-hand attempts, correlated within seed blocks. Stacks reset to 100 BB each hand;
there is no rake, session adaptation or tournament survival objective.

Each full-match action is applied by the authoritative adapter and its single
transition is projected by the existing privacy-safe history projector. Cumulative
visible facts produce the same context as full-history replay, verified in tests;
this avoids quadratic repeated replay of long scripted raising sequences.

Six isolated Node workers execute match groups. They receive no provider keys or
application/test environment files. A local TypeScript loader uses the installed
compiler and aliases `server-only` to an empty benchmark marker, as Vitest does.
There are no inference requests. Worker failures fail the runner. Reports are
checkpointed after each group in ignored `benchmarks/results/equity-rules-v1.json`.
Keep dated evidence separately; rerunning does not overwrite preserved evidence.

## Ablations

- **Frozen:** copied current Equity Rules strategy, legacy hand/draw analysis,
  context, random-equity estimator and sizing. See `freeze-v1.json` for immutable
  checksums and the mechanical import/memoization adjustments. Existing earlier
  baselines and evidence remain intact. The adapter remains the authoritative
  legality/evaluation boundary.
- **Facts:** the same strategy branches with live-pot/stack-capped call context,
  corrected sizing (including existing 2/2.5/3 BB opening options), and exact
  shared made-hand/draw facts. The production policy already uses contestable-pot
  call odds, so that is not a new strategy improvement.
- **Structured:** corrected context plus explicit preflop, value, semi-bluff,
  passive continuation and river stages. Unopened/limped/raised/re-raised pots
  derive from replayed authoritative actions. Unopened value/bluff raises prefer
  the existing 2/2.5/3 BB options for easy/medium/hard; other pots retain fractional
  options. No new starting-hand chart is introduced.

Structured postflop value requires a made category beyond high card, hero
participation/improvement and the difficulty value threshold with its original
pressure adjustment. On a five-card board improvement is the adapter's exact
comparison against the board's rank and kickers; before the river, the five-card
hand necessarily includes hero cards. Category strength alone and the old
unconditional equity >= 0.6 shortcut cannot qualify for value. A genuine hero
flush/straight draw permits semi-bluffing only on flop/turn, against exactly one
remaining active opponent with chips. Difficulty toggles, the 0.34 equity floor,
0.55 deterministic selection frequency, call margins and exact heads-up river
protections remain. These are heuristic hypotheses, not optimal strategy.

Every variant uses identical stripped visible history for random-equity seeds
and deterministic frequencies. This isolates strategy/context changes from
sampling changes. Unknown history receives the frozen context and frozen policy;
fixed coverage reports the fallback denominator and counts explicitly. Complete
match histories should need no fallback. Both random-equity calculations and
exact river-share evaluations use output-identical, bounded worker-local caches.
Reported context, decision and whole-hand latency therefore describe this benchmark's warm
cache execution, not standalone cold production latency or a speedup claim.

## Coverage and evidence

Fixed engine-replayed fixtures cover all difficulties, positions and preflop pot
types, shallow/deep stacks, made hands, draws, board strength, multiway pressure
and two through six players. Existing river, short-call and side-pot scenarios
are reused. Unit checks also cover non-reopening short all-ins, all-in opponents,
unknown history, hidden-card invariance and whole-block failure exclusion.

Complete-hand opponents are the frozen rules policy and the existing passive and
minimum-sizing aggressive scripts. Scripts inspect only legal actions; their
unused equity context uses one sample, with no change to decisions. Every non-subject seat uses the selected
opponent. Rules opponents use the same difficulty as the subject. Scripted
opponents do not approximate GTO. Chip comparisons exclude a whole seed block
across all variants if any rotation/variant fails; the report lists every failed
seed, rotation, variant and reason. Completion counts include attempted hands.
Action/sizing/stage frequencies and latency summaries use only complete blocks.

Paired differences are mean chips (BB) per hand within each seed block, followed
by a seeded 2,000-resample percentile bootstrap of entire blocks. Report heads-up
and six-seat populations separately. The 95% intervals are exploratory and have
no correction for multiple comparisons. Low random-equity sample budgets add
policy noise; results are conditional on these fixtures/opponents and do not
establish a general win-rate improvement.

Plan 1's calculator additionally supplies a separate heads-up fixed-decision
range contrast, across all difficulties. Each contrast holds a legally replayed
current decision fixed and passes conditional range equity as a separate strategy
argument. The DTO's random-equity field is preserved. Range provenance, sampling
uncertainty and unsupported results accompany actions. These supplied hypotheses
are never used in full matches or represented as range inference; overall
showdown share is not side-pot chip EV.

Run `npm run check`, `BOT_SCENARIO_LIVE=false npm run test:bots`, and
`npm run benchmark:poker-context` after changes. The experiment needs no database,
build or SQL checks. Consult the [dated ablation report](report-v1.md) before
proposing a separate production promotion plan. No PokerSkill code, tables or
strategy text is reused; this experiment uses the repository's existing rules,
shared facts and [Plan 1 hypotheses](../range-equity/README.md).
