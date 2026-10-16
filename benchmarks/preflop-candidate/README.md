# Focused KK/QQ preflop candidates

Offline follow-up to the [action-value study](../preflop-action-value/report-2026-10-15.md).
This experiment compares benchmark-only call and raise-to-3-BB overrides for medium
KK and hard QQ. It does not promote a production strategy or change providers,
context, deterministic seeds, output contracts, persistence or application behavior.
No provider requests or credentials are required; prior paid authorizations remain
exhausted and all earlier evidence is preserved.

## Commands and recovery

These are the historical study commands. After the medium-KK implementation,
use a [restored baseline tree](#preserved-baseline-reanalysis) for frozen work;
the live checkout must fail its old source-freeze checks. Completed work needs
only `analyze`, not another simulation run.

Use Node 24 and lockfile-installed dependencies:

```sh
npm run benchmark:preflop-candidate -- smoke
npm run benchmark:preflop-candidate
npm run benchmark:preflop-candidate -- analyze
```

The default command runs fixed checks, development screening, immutable selection,
confirmation for qualifying candidates, and analysis. Individual stages are also
available as `fixed`, `screen`, and `confirm`; each requires its completed
prerequisites. Extra arguments are rejected. Smoke uses one eight-sample fixture,
never writes evidence and cannot pass the 5,000-sample checkpoint validator.

One coordinator feeds at most four persistent isolated workers. Workers receive
only `NODE_ENV=test` and `EXTERNAL_INFERENCE_ENABLED=false`, reject credential
variables, block `fetch`, and import deterministic policies without provider
resolution. No application/test environment files, database or server are used.
Scripted passive/aggressive policies ignore equity and get one-sample contexts;
every actual Rules decision, including the initial baseline and frozen-opponent
continuations, uses the production 5,000-sample budget.

Before full work, the runner freezes all relevant source hashes, engine sources,
lockfile, allocations and configuration in `freeze-v1.json`. Completed paired
blocks are validated and atomically checkpointed under the ignored
`benchmarks/results/preflop-candidate-v1/`. Resume the same command after an
interruption: unchanged sources/configuration and exact matching checkpoints are
required. Interrupted incomplete blocks may be recomputed; completed failures are
retained without replacement. A coordinator lock prevents overlapping schedulers.
Dead same-host owners are recovered only after the operating system confirms the
PID is absent, under a separate recovery lock. Unknown, live or foreign-host
owners fail visibly; do not delete a lock or assume expiry while work may run.

Completed phase archives are reused after manifest/row validation. Selection binds
the exact development archive; confirmation also binds selection and fixed-check
archives. Completed `run` refuses replay once analysis exists. Use `analyze` to
reproduce immutable analysis without simulations or inference. Changed source,
configuration or allocations require a new version/output location. Do not modify
old freezes or overwrite prior evidence.

## Candidate boundary

The baseline must choose fold; the context must show a six-seat UTG preflop
opening with complete empty action history, no board, five active opponents,
and equal 100-BB starting stacks (accounting for posted blinds). Only medium KK
and hard QQ can change. A call uses the engine's exact legal call amount; a raise
is to three BB and must be within engine bounds. Unexpected missing/illegal
candidate actions fail instead of silently falling back.

Other hands, difficulties, positions, stacks, existing baseline calls/raises,
unknown history, prior actions and postflop states return the exact baseline
result. Thus the experiment changes neither a general value threshold nor an
opening chart. Hero continuation uses current production Rules; opponent controls
are existing frozen Rules, check/call and minimum bet/raise policies.

Fixed coverage comprises all 169 classes at the six-seat opening in every
difficulty; KK/QQ at every available position in 2–6-seat games and 20/100/150-BB
stacks; and unequal-stack, unknown-history, limped/raised/re-raised and protected
postflop controls. Big-blind position coverage uses a legal limped pot because an
unopened pot cannot reach the BB after everyone else folds. These are covering
sets, not a claim of full Cartesian or playing-strength coverage. Fixed decisions
also use 5,000 samples; low-sample helper contexts are used only to construct
engine fixtures, never to choose an evaluated Rules action.

## Frozen sampling and selection

For each target, six physical pair combinations × actual hand numbers 1, 2, 7 and
16 form 24 equally weighted strata. Hand numbers advance through engine-backed
royal-board split-pot setup hands, preserving all stacks; current-hand histories
and equity seeds use the resulting real hand number. No context-only number
substitution is used. Every runout has a fresh seeded shuffled remaining deck.
Arms and opponent controls share the identical deck within a block; development,
confirmation and earlier studies have disjoint seed namespaces.

- Development: four runouts per stratum, 96 shared blocks per target. Each block
  compares baseline/call/raise against all three controls: at most 1,728 rollouts.
- Selection: each alternative needs a positive paired 95% interval lower bound
  against every control and no failed block. Among qualifiers, maximize the worst
  control's lower bound; exact ties select call. Freeze the selection before
  reading confirmation outcomes.
- Confirmation: ten fresh runouts per stratum, 240 shared blocks per selected
  target, comparing the chosen alternative with baseline against all controls:
  at most 2,880 rollouts. If neither target qualifies, confirmation is empty.
- Use 20,000 seeded bootstrap resamples within every stratum, retaining equal
  stratum weights. Confirmation confidence is `1 - 0.05/6` (99.1667%) per
  comparison, retaining all six planned comparisons even if fewer qualify.
  Bonferroni provides a nominal family adjustment; percentile-bootstrap coverage
  is approximate, not a finite-sample guarantee.
- Confirmation succeeds for a target only with 240 attempted blocks, no failed
  blocks, all lower bounds positive, and passing fixed checks. Otherwise defer;
  do not switch to the other alternative or expand the sample after inspection.

Baseline non-fold cases remain in their strata with zero treatment effect. Exact
first-action duplicates share a rollout because all later hero decisions are
unchanged. One failure excludes the entire shared block across alternatives and
all opponent controls; completed failures prevent advancement. The 200-action
limit, engine application, chip conservation and privacy-safe current-hand
projection remain enforced. No failure is replaced by another action or sample.

## Values and interpretation

Value is terminal hero stack minus stack immediately before the tested action,
in BB. These are independently reset, no-rake hands, conditional on one holding,
position, stack configuration, four selected hand-number settings and three
explicit opponent policies. They are not GTO values or whole-game strength.
Baseline action frequencies and treatment incidence must accompany every result.

A standardized eligible-UTG full-range effect may multiply the conditional target
mean by `6/1326`, separately for each difficulty/opponent. The other 168 classes
remain baseline-equivalent by construction. Do not add medium/hard effects,
aggregate favorable opponents, extrapolate to long-running unequal-stack games,
or interpret fixed fallback coverage as strength evidence at other seats/stacks.

Run `npm run check` for mechanical and regression validation. The final report
must retain every alternative, opponent, exclusion, frozen selection and holdout
verdict, with archive hashes and limitations. Confirmation can motivate a later
promotion review; production stays unchanged throughout this study. Seed
normalization and provider-normalization candidates remain deferred.

## Completed results

The [2026-10-16 report](report-2026-10-16.md) records 933 passing fixed
decisions, 192 development blocks, 480 confirmation blocks and 4,608 continuations,
with zero exclusions. Medium KK raise-to-3-BB passed the conditional-value gate;
hard QQ call remains deferred because its frozen-Rules interval includes zero.
Production was unchanged at study completion; the subsequent narrow medium-KK
implementation is described below.

See the [promotion review](promotion-review-2026-10-16.md) for the recommended
medium-KK scope, baseline preservation and implementation/validation sequence.

## Preserved baseline reanalysis

The historical experiment and its archives remain unchanged. The production
registry now selects `OpeningAwareEquityRulesBot`, which applies only the confirmed
medium-KK raise3 guard. QQ remains baseline. `EquityRulesV2Bot` still implements
the historical baseline used by this experiment. The original report records
production state at study completion; the subsequent implementation is documented
in the promotion review and gameplay/architecture guides.

Live source changes intentionally make the original runner's freeze checks fail.
Do not change its manifest to permit reanalysis. `baseline-source-v1.json.gz`
preserves all 344 frozen source files and six original manifest/evidence files
(350 files total), with no environment files or credentials. Its SHA-256 is
`96b860174958bc3d0604c732009e3805ba409206795e47fbe17894ef841d70d7`.
The restore command verifies that hash and every file, refuses an existing
destination, and shares only the installed dependencies after verifying the engine:

```sh
node benchmarks/preflop-candidate/restore-baseline.mjs /tmp/ai-holdem-kk-baseline
cd /tmp/ai-holdem-kk-baseline
node benchmarks/preflop-candidate/run.mjs analyze
```

Choose a new destination if that directory exists. This reanalysis reads saved
evidence and runs no poker simulations or provider calls. The restored tree is
for offline study recovery, not application deployment. Keep the original pinned
dependencies available; the restoration fails if engine sources differ.
