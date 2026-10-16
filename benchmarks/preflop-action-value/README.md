# Preflop action-value investigation

Offline follow-up to the [bot improvement report](../bot-improvements/report-2026-10-15.md).
That report found no opponent-count or call-price arithmetic defect, but left the
quality of premium preflop decisions unresolved. This experiment compares the
conditional simulated value of alternative first actions. It changes no production
strategy, provider, API, persistence or model setting and makes no paid requests.

The [completed report](report-2026-10-15.md) records all 54,000 paired seed blocks,
184,500 continuations after deduplication within each seed block and zero exclusions. It prioritizes a separate
benchmark-only preflop candidate experiment while retaining production deferrals.

## Commands and evidence

Node 24 and the lockfile-installed dependencies are required. No database or
application server is used.

```sh
npm run benchmark:preflop-action-value -- smoke
npm run benchmark:preflop-action-value
npm run benchmark:preflop-action-value:analyze
```

The main command freezes source hashes and the full configuration in
`freeze-v1.json` before starting three isolated workers. It never loads application
or test environment files. Workers receive only `NODE_ENV=test` and
`EXTERNAL_INFERENCE_ENABLED=false`, reject credential variables, block `fetch`,
and import deterministic offline policies without provider resolution. The smoke
command runs two eight-sample blocks without writing evidence. Unit tests run with
`npm run check`; the full study is separate from CI.

Group checkpoints live in the ignored `benchmarks/results/preflop-action-value-v1/`.
An interrupted offline run may reuse completed groups only when their manifest
hash and group configuration match the unchanged source freeze. There are no
provider calls to replay. The completed run writes `evidence-v1.json.gz`
exclusively and refuses to overwrite it. Use `analyze` to regenerate the derived
`analysis.json` locally without simulation, credentials or inference. A changed
experiment needs a new version/output location; preserve completed artifacts and
all earlier audit/improvement evidence.

## Frozen design

- AA, KK, QQ, AKs and AKo, each represented by one fixed suit combination.
- Six-seat UTG opening and heads-up button/small-blind opening; no preceding
  voluntary action, 100-BB stacks, 0.5/1-BB blinds, and no rake.
- Current production Rules first action versus fold, call, and raise-to-3-BB.
  All actions pass through the authoritative adapter. Exact duplicates share one
  rollout. The production action and matched rule are retained per block.
- After the tested first action, the hero uses unchanged production Equity Rules.
  Other seats use the existing frozen Rules, scripted passive or scripted
  minimum-bet/raise aggressive policy. Every seat uses the group's difficulty.
- 500 deal seeds per hand/node/opponent/difficulty at 100 equity samples per Rules
  decision: 90 groups and 45,000 primary seed blocks. The first 100 seeds repeat
  at 1,000 samples: 90 separate sensitivity groups and 9,000 additional blocks.
  Scripted opponents ignore equity and use a one-sample context calculation;
  this does not change their legal-action-only decisions.
- Deals condition only on the hero's holding. A seeded Fisher–Yates shuffle of
  all remaining cards supplies opponent holdings, burns and board without
  replacement. Each hand/node/seed has the same complete deck in every arm,
  difficulty, opponent policy and sample-budget group. There is no action-based
  range conditioning in these unopened situations.
- Every independent game starts at hand number 1. The existing Rules frequency
  hash is retained; hand-number variation is not sampled separately. Initial
  baseline frequencies therefore describe fixed decision inputs, not the full
  production distribution of mixed actions.
- Contexts use the production legacy Rules projection, including its existing
  equity/hash inputs and legacy sizing options. A bounded 10,000-entry cache
  memoizes exact visible inputs only. No hidden opponent holding or future card
  enters a decision context. No timing/performance claim is made.

## Values, pairing and limitations

Action value is `(terminal hero stack - hero stack just before the first action)
/ big blind`. Blinds already posted are sunk costs, so folding has value zero;
a heads-up split all-in returns +0.5 BB from the small blind's decision point.
All continuations finish through the engine, with chip conservation checked at
every transition. A 200-action limit bounds each rollout. No fallback replaces a
failed action. Any failed alternative excludes the entire seed block; saved rows
retain exclusions, deck hashes, baseline actions and values.

Analysis reports each hand/node/difficulty/opponent/sample group separately,
including baseline frequencies, action means and paired differences against
baseline. Percentile 95% intervals use 2,000 whole-seed bootstrap resamples.
The three comparisons within a group and repeated uses of deals across groups
are correlated; intervals are descriptive, unadjusted for multiple comparisons,
and must not be pooled as independent observations. Sensitivity results must be
compared with the same first 100 seeds of the primary run, not its full 500.

Both simulation budgets are below the production default of 5,000 equity samples.
The 1,000-sample sensitivity check does not establish equivalence to the production
budget; any later promotion study must validate that gap.

These values depend on all continuation policies, the sampled holdings, a fixed
hero suit representative, sample budgets, 100-BB stacks and no rake. They are not
GTO values, range recommendations, or estimates against real human/provider
opponents. In particular, passive and minimum-raise policies are deliberately
extreme controls. Random-opponent showdown equity measures a different quantity
from these action values. A favorable alternative can motivate a separate,
isolated strategy experiment; it does not authorize production promotion.
