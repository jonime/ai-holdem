# Session adaptation pilot

The [completed amended pilot report](pilot-report.md) records 2,609 reservations,
one complete LLM/frequent-folder block (+22.92 BB/100 for memory), five incomplete
blocks and two skipped Jev blocks. Heavy missingness supports feasibility conclusions;
production behavior remains unchanged. All paid allocations are closed.

Benchmark-owned, heads-up memory ablation of current confidence-aware Jev
(medium) and `openai/gpt-5.4-mini` (low reasoning, balanced). Production code,
models, current betting menu and production 5,000-sample equity remain unchanged.
The quarter-pot candidate is a separate experiment. This is an exploratory pilot,
not a promotion or human-strength study. No paid results exist until an explicitly
authorized run is completed and reported. Earlier experiments' allocations remain
exhausted and cannot fund this run.

## Commands and authorization

Use Node 24+ from the repository root. Full checks and the long experiments are
intended to be run by the operator. Offline commands require no credentials:

```sh
npm run check
BOT_SCENARIO_LIVE=false npm run test:bots
npm run benchmark:poker-context
npm run benchmark:session-adaptation
npm run benchmark:session-adaptation:prepare
```

The offline benchmark prints progress every five hand rounds and saves synthetic
verification evidence to `benchmarks/results/session-adaptation-offline.json`.
Prepare requires a successful full 60-hand, 5,000-sample offline run on the exact
current sources. It writes an exclusive `freeze.json` containing source hashes,
policies, models, opponents, seeds, schedule and analysis rules. Review and retain
that manifest with the evidence. Preparing performs no inference. Source changes
require rerunning offline verification and reviewing a new freeze before any paid
run; never replace a freeze or ledger belonging to a started allocation.

**Paid execution requires fresh explicit authorization.** Once the operator has
reviewed and authorized this new allocation, run the following deliberately
separate command. Do not run it under an old experiment's authorization:

```sh
SESSION_ADAPTATION_AUTHORIZATION=authorize-new-session-adaptation-4800 \
BOT_SCENARIO_LIVE=true EXTERNAL_INFERENCE_ENABLED=true \
BOT_DECISION_CALL_CAP=5000 \
npm run benchmark:session-adaptation:live
```

Only live loads optional `.env.test` (shell values win). It requires
`TYPESAFE_API_KEY`, `LLM_API_KEY`, and
`LLM_API_ENDPOINT=https://openrouter.ai/api/v1/chat/completions`.
It constructs no Eevo HTTP client and needs no Eevo credential. No compatibility
requests are used: this is within the permitted maximum of one per provider and
leaves the prescribed decision maximum at **4,800**, below the 5,000 ceiling.
OpenRouter fallbacks are disabled. There is one inference request in flight,
production provider deadlines, no retry, substitution or forced action.

Live prints block starts, every dispatch and response, remaining block allocation,
and completed-hand chip changes. Silence between dispatch and response means the
production request is in flight (up to its 60-second deadline). The 200-action
emergency guard fails the block and stops the whole run. Provider, parser, engine
and invariant failures stop the whole run. Budget exhaustion alone excludes the
entire block and continues the other prescheduled blocks. Unused requests never
transfer. No partial hand is scored. Partial decisions remain diagnostic evidence.

Reservations are fsynced before dispatch. Checkpoints use fsync plus atomic rename.
A permanent exclusive `.started` marker prevents concurrent runs, resume and replay,
including after interruption. Do not delete it to continue. SIGINT/SIGTERM record
interruption; a hard crash may leave `running` status and an unresolved reservation,
which must be treated as unknown and spent. Reserved requests conservatively count
against the allocation even if dispatch or response completion is uncertain.

Report without environment loading, inference clients or network access:

```sh
npm run benchmark:session-adaptation:report
# Optional alternate ledger:
npm run benchmark:session-adaptation:report -- /absolute/path/live-ledger.json
```

This writes Markdown and detailed JSON in `benchmarks/results/`. Run reporting
after a failure too. The permanent ledger and marker live in this benchmark folder;
these local artifacts are gitignored. The report records the freeze hash. Preserve
both freeze and ledger as evidence. No automatic continuation is supported.

## Design and information boundary

Two seeds (19381, 73091), two providers and two opponents produce eight independent
paired blocks. Each contains memory/omitted × original/swapped subject seat: four
independent 60-hand episodes, 240 hands/block, 1,920 planned hands. Each block has
600 reserved decision requests maximum. Hand-boundary scheduling rotates the four
episodes and counterbalances arm order by seed/provider/opponent. All four use
the same deterministic shuffled deals; swapping exchanges the two private deal
positions in each dealing round while preserving the board and remaining deck.
The subject changes physical seat, so button exposure is also swapped. Each
episode maintains normal button rotation and sequential hand numbers.

Participants retain stable identities and configurations. Between completed hands,
remove/reseat through the production adapter resets both stacks to 200 chips
(100 BB at 1/2 blinds) without touching engine internals. Complete initial states,
pre-action states, actions and final states live only in episode-local memory.
Every completed hand is replay-validated, including hand 60. Before a subject
acts, the production projector validates only its latest 50 completed hands plus
the current hand. No synthetic counts, warm-up, future hands, other episodes or
forced post-hand reveals enter a provider request.

Memory omitted drops the entire session statistics package, including hero
statistics, before the same production wrapper. Current-hand history, visible
cards, corrected prices, facts, sizing and exact safeguards remain. Jev consequently
has no derived opponent advice. LLM retains its current general production guidance.
For diagnostics only, both arms' public historical counts and threshold availability
are measured locally; omitted-arm measurements are never passed to the subject.
Jev confidence-advice activation is separate from general LLM guidance. A confidence
signal shown for the LLM is diagnostic and does not mean Jev advice was supplied.

Reports and ledgers contain only synthetic experiment identifiers, action/size
summaries, public counts, advice/threshold availability, per-hand profits, timings,
fixed error categories, available costs and sanitized returned revision IDs. Private
histories, decks, holdings and raw provider responses are not persisted. Offline
fixture histories can be reproduced from the frozen seeds and scripts. Live model
responses cannot be reproduced deterministically; recorded action summaries retain
the trajectory evidence without private states.

## Opponents and controls

Frequent-folder calls 20% of faced bets; frequent-caller calls 85%. Both fold the
rest, open an unopened heads-up button to 2.5 BB with 60% probability and otherwise
limp, check free outside that opening, and never reraise. Calls use exact legal
engine amounts; every action is engine validated. Independent draws are keyed by
seed, hand, role and decision index. Scripts read no hidden opponent cards, memory
setting or other histories. These stationary scripts isolate continuation tendencies;
they represent neither human players nor strength references.

Focused unit checks cover actual Node startup, legal scripts, mirrored decks,
isolation, hidden-card invariance, memory omission, replay/reset/rotation,
provider-failure propagation, exclusive durable accounting, exhaustion and whole-block
scoring. The full offline benchmark plays four independent episodes with a scripted
observation-responsive subject, checks the rolling 50-hand window and future-hand
rejection, and compares the current registered Equity Rules bot with/without memory
on identical contexts as a negative control. Production Jev/Eevo wrappers receive
scripted responses for parity; this provides no Eevo strength evidence. A separate
positive measurement control naturally records 55 raise/fold hands against an
always-folding control opponent. It must activate unchanged production thresholds
and change its opening size; that control opponent never enters the paid schedule.
The unit smoke uses small equity samples; the full offline and paid runs use 5,000.
No database migration, hosted data, SQL workflow or deployment build is needed.

## Analysis and interpretation

Only a complete four-episode block enters chip comparisons. For each seat,
subtract omitted profit from enabled profit, average the two seats, then divide
by 60 hands and multiply by 100. Report blocks and descriptive cell means separately
for each provider/opponent. Two independent blocks per cell cannot establish reliable
strength significance; no bootstrap intervals or significance claims are produced.
Reusing seeds across providers does not add independent observations.

Windows 1–10, 11–30 and 31–60 report public counts, usable-observation availability,
Jev advice activation, opens/checks/bets/calls/folds, sizing, chips, requests,
failures and costs. Windows are descriptive, not a learning-curve test: arms encounter
different opportunities. Primary chips never condition on active advice. Sparse
observations are a finding; thresholds, sessions and budget cannot be changed after
seeing results. Incomplete blocks retain consumed requests, completed-hand proportions
and partial diagnostics. Behavior-dependent budget exclusions can bias the complete
subset; heavy missingness supports feasibility conclusions only.

The report supports separate review of exposure, behavioral response and complete
paired chips. Stochastic arm differences alone do not prove causal response to a
particular observation. Decide later between a larger confirmatory study, a focused
adaptation-policy experiment, or retaining production behavior. There is no automatic
promotion and no paid Eevo evidence.

## Attribution

[Game Arena's poker methodology](https://arxiv.org/html/2609.31473v1#S2.SS2)
and [open harness](https://github.com/google-deepmind/game_arena) inspire episode-based
comparison and mirrored deals/seats. No Game Arena code or datasets are reused.
Our 60-hand episodes, 50-completed-hand production projector, aggregate-only historical
information, no historical holdings/outcomes, no post-hand revelation, stationary
scripts, no retry, and tiny descriptive pilot differ from its full tournament design.
Its confidence/strength evidence does not transfer to this pilot.

## Explicit amendment: six untouched blocks after first interruption

The operator explicitly amended the no-resumption rule after the original run
stopped on a provider timeout at reservation **889**. The original Jev/frequent-folder
block exhausted 600 requests at 210/240 hands; LLM/frequent-folder stopped with
289 reservations at 132/240 hands. Both remain incomplete and excluded. The unknown
timeout reservation remains spent. Neither block, nor any of its hands or requests,
may be resumed or replayed.

This one-time amendment permits only the **six original untouched blocks**, in
original order, from hand 1 with empty episode histories. Seeds, deal mappings,
policies, models, production thresholds, 60-hand episodes, 5,000-sample equity,
current menu, 600-request block caps and analysis rules remain frozen. There are
no replacement blocks, new seeds or transfers from the two incomplete blocks.
Maximum further reservations: **3,600**; maximum combined reservations: **4,489**.
The amendment was authorized after inspecting partial results and must be disclosed
when interpreting the combined pilot; it does not restore a preregistered uninterrupted
run or remove behavior-dependent missingness.

Preparation is offline and exclusive:

```sh
npm run benchmark:session-adaptation:continue:prepare
```

It preserves `freeze.json` and `live-ledger.json` byte-for-byte. A new
`continuation-freeze.json` pins their hashes and the current runner sources. The
original policy/provider/session/opponent/engine/dependency hashes must still
match the first freeze; only execution, reporting, tests, npm commands and guide
files may change. Full offline simulation does not need repeating for this runner
amendment; focused accounting/lineage tests check the changed paths. The prepare
command rejects a different parent allocation, observations in any supposedly
untouched block, or any change to protected original policies.

After preparing, the operator runs the paid continuation, using macOS `caffeinate`
to inhibit idle system sleep (keep the computer powered and do not close its lid
or manually put it to sleep):

```sh
SESSION_ADAPTATION_AUTHORIZATION=authorize-session-adaptation-remaining-six-3600 \
BOT_SCENARIO_LIVE=true EXTERNAL_INFERENCE_ENABLED=true \
BOT_DECISION_CALL_CAP=5000 \
caffeinate -i npm run benchmark:session-adaptation:continue
```

The original authorization string cannot start the continuation. This command
uses its own exclusive `continuation-ledger.json` and permanent `.started` marker,
checks original-evidence hashes before every dispatch, and enforces both the
continuation cap and combined accounting. One inference request remains in flight.
A new failure or interruption stops this continuation; this amendment authorizes
no further restart. Never delete either run's marker.

The existing report command automatically combines the two ledgers when the
continuation ledger exists, validates lineage, retains original failures and
unresolved reservations, and discloses the amendment in JSON and Markdown:

```sh
npm run benchmark:session-adaptation:report
```

Passing an explicit ledger path still reports only that ledger. Reporting never
loads credentials or inference clients. Preserve both freezes, both ledgers and
both permanent markers as the complete experiment record.

## Explicit amendment: LLM only after quota increase

The first continuation stopped after **668** additional reservations: Jev/frequent-caller
exhausted 600 at 204/240 hands, and LLM/frequent-caller failed after 68 reservations
at 19/240 hands. The operator identified an OpenRouter key quota and increased it;
the stored categories are `timeout` for the original failure and `provider` for
the second failure. These categories alone do not establish the external cause.
All four incomplete blocks and both unresolved reservations remain preserved and
excluded from chip comparisons. Prior combined reservations are **1,557**.

The operator authorized a new amendment limited to the **two untouched LLM blocks**:
frequent-folder and frequent-caller at seed 73091. The two untouched Jev blocks
are **skipped**, without spending or replacement. Jev need not run to analyze the
LLM memory contrast separately. Existing incomplete Jev blocks and other historical
experiments do not supply complete paired chip evidence for this pilot. At most
one complete block remains possible per LLM/opponent cell; no reliable strength
or cross-provider comparison follows. The provider restriction was chosen after
partial results were available and is disclosed in the report.

The source-frozen model, balanced playstyle, low reasoning, equity budget, memory
boundary, deals, opponents, schedules, session lengths, thresholds, analysis and
600-request block cap remain unchanged. No interrupted hand or block is retried.
The additional allocation is **1,200** requests maximum; the combined maximum is
**2,757**, including unresolved reservations. Unused allowances never transfer.

Prepare once, without inference:

```sh
npm run benchmark:session-adaptation:llm:prepare
```

This creates `llm-freeze.json`, pinning both previous evidence lineages and current
runner sources while checking protected original policies against the first freeze.
It overwrites none of the earlier freezes, ledgers or permanent markers. Only LLM
credentials are needed for the paid command:

```sh
SESSION_ADAPTATION_AUTHORIZATION=authorize-session-adaptation-llm-only-1200 \
BOT_SCENARIO_LIVE=true EXTERNAL_INFERENCE_ENABLED=true \
BOT_DECISION_CALL_CAP=5000 \
caffeinate -i npm run benchmark:session-adaptation:llm
```

This uses an exclusive `llm-ledger.json` and permanent `.started` marker, verifies
both earlier evidence lineages before each dispatch and permits no automatic retry
or further restart. The operator runs inference. The report command automatically
merges all three runs, retains all exclusions and failures, and explicitly marks
the untouched Jev blocks `skipped`:

```sh
npm run benchmark:session-adaptation:report
```

After this amendment is prepared the combined report also shows skipped Jev blocks
before LLM execution begins. Focused tests exercise scheduling, lineage, exclusive
accounting, source tampering, the actual Node live branch with a blocked ledger,
and reporting without credentials or network. No paid compatibility calls are added.
