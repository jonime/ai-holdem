# Independent postflop bet-size ablations

This is experimental tooling, not a shipped menu change. Production still uses
`current`. Compare `quarter-pot` and `1.5-pot` independently with current; never
combine additions. Equity Rules retains its existing sizing and strategy.

The authorized pilot completed all **960 requests**. Its allocation is exhausted.
Only **LLM quarter-pot** passes the frozen usage screen; no playing-strength claim
or production promotion follows. See [the completed report](live-report-2026-10-16.md).
Eevo retains offline compatibility coverage only.

## Frozen design

The 16 fixtures use engine actions and replay-validated previous hands. Twelve
eligible states cover 2/6 dealt players × flop/turn/river × contrasting holdings:
AA value and suited connected draws on flop/turn, AA and weak missed holdings on
river. Smaller stacks are 40 chips heads-up and 100 chips at six seats; deeper
stacks are 400. A legal preflop raise to 6 and calls make both additions available
without clamping. The four controls are preflop opening, facing a flop bet with a
raise, a 3-chip short stack, and a heads-up royal-flush board whose exact safeguard
removes aggression. Every candidate is checked through the engine.

Absent, insufficient, frequent-fold and frequent-continuation conditions each
occur three times across eligible fixtures. The observed opponent is seat 0;
unrelated opponents remain unknown. Histories use 42 completed hands and existing
ownership continuity, replay validation, projection and confidence advice. Only
the target has sparse ownership continuity in the insufficient condition. Changing
stacks by removing/reseating between hands preserves hand numbering and immutable
ownership. Historical holdings/outcomes never enter provider context.

A single deterministic **5,000-sample** random-hand equity calculation per fixture
is reused by all providers/menus/repetitions. The menu changes only concrete sizes:
`round(livePot × fraction)` is the additional payment, added to current street
commitment. Omission reasons distinguish baseline, preflop, unavailable/safeguarded
bet, below minimum, maximum or above, and duplicate. No new candidate is clamped,
relabels an existing amount, replaces all-in, changes raises, or restores removed
aggression. Facts, statistics, playstyles and advice are fixed within a fixture;
the warning against oversized bets based on fold observations remains intact.

`default-requests.json` records request hashes captured using the pre-refactor
SystemOne question builder and LLM implementation at the recorded commit with a
small test-only equity budget. The separate
`../baselines/systemone-v4-menu-injection-freeze.json` pins current-menu offline
chart regressions after injection; the old regression and every paid manifest are
preserved. The historical LLM-v2 file has only a type import adjustment for the
extended internal union, with no runtime change. Unit tests compare current default Jev, Eevo and LLM
requests with those hashes. The offline benchmark uses the full production budget
and exercises real provider wrappers, SystemOne move validation and LLM schema and
response parsing, with scripted transports. Eevo has **offline compatibility only**.

## Commands

The checked-in `plan.json` and `freeze.json` are already prepared and verified.
Do not rerun prepare against these immutable files. `offline-evidence.json` records
48 fixture/menu compatibility cells at 5,000 equity samples, with no inference.
See [the offline validation record](offline-report.md) and
[the paid report](live-report-2026-10-16.md). The user confirmed the production
build passed. The startup repair subsequently passed `npm run check` with 146
files / 2,003 tests. Existing paid authorization is exhausted.

```sh
npm run benchmark:bet-sizing
npm run benchmark:bet-sizing:analyze -- benchmarks/bet-sizing/live-ledger.json
```

Offline disables network and writes `benchmarks/results/bet-sizing-offline.json`.
`npm run benchmark:bet-sizing:prepare` is for preparing a new version before any
freeze files exist. It performs no inference, calculates the full fixture inputs
once and creates
exclusive `plan.json`/`freeze.json` files. It freezes source, runner, policy, menu,
fixture, configuration, input and screening hashes. Prepare only after source edits
and checks are complete. Existing freezes cannot be overwritten by the command.
Source changes invalidate a prepared run; do not rewrite hashes to bypass failure.
The Node live-startup regression test uses a disposable current-source plan/freeze
fixture so later repository edits do not depend on the completed pilot’s frozen
hashes. It still runs the actual live entry point and stops at a scripted,
credential-free HEAD failure before ledger creation or inference.

**Historical launch command for the completed allocation; do not run again.**
A later paid study needs a new plan and explicit authorization:

```sh
BET_SIZING_AUTHORIZATION=authorize-new-960-bet-sizing-v1 \
BOT_SCENARIO_LIVE=true EXTERNAL_INFERENCE_ENABLED=true \
BOT_DECISION_CALL_CAP=1000 npm run benchmark:bet-sizing:live
```

Use local `.env.test` for Jev/OpenRouter credentials and the exact
`LLM_API_ENDPOINT=https://openrouter.ai/api/v1/chat/completions`. No Eevo key is
required, and no Eevo live client is constructed. Never put secrets into evidence.
The authorization string is a deliberate execution interlock; this guide does not
constitute permission to spend. This allocation is separate from every previous
pilot, including their exhausted allocations.

The prescribed plan is **2 providers × 16 fixtures × 3 menus × 10 = 960 requests**:
Jev `jev-latest` medium and OpenRouter `openai/gpt-5.4-mini`, low reasoning, balanced.
Zero paid compatibility calls are needed (the design permits at most one/provider,
which would yield 962). The 1,000 shared ceiling is not permission for extra calls.
Repetitions are interleaved, with provider/menu/fixture order rotations. One request
is in flight. Production headers/body deadlines remain 60 seconds, and OpenRouter
fallbacks are disabled. Record configured models and allowlisted returned revision
metadata where provided; Jev aliases do not guarantee a pinned vendor revision.

Credential-free HEAD connectivity preflight precedes inference. The exclusive
one-run ledger reserves each entry and debits before HTTP dispatch, checkpoints
partial results atomically and stops the entire run at the first provider, engine,
or invariant failure. Failed attempts consume allocation. There are no automatic
retries, fallback actions, model substitutions, resume or replay. An interrupted or
failed run requires new planning and authorization, not removal of its ledger.
No background process runs; the user starts long commands locally.

Analysis reads completed and partial ledgers without inference. It reports reserved
and sent attempts, incomplete reservations, availability/omissions, observed added-size
selection, check/bet counts, exact sizing distributions, payment relative to live
pot/effective stack, paired transitions from old sizes/all-in, latency, cost coverage,
invalid responses, invariant/engine rejections, control variability and exclusions.
Raw aggregates include partial cells; contrasts use complete three-menu matched
repetition blocks. A transition is a paired diagnostic observation, not proof that
an individual provider decision was causally replaced. All-in changes, aggression,
and provider probabilities do not measure strength or strategic mixing frequencies.
No EV score is assigned without an independent valid reference.

## Predeclared screen and promotion

A candidate is eligible for a later match study only when the prescribed pilot is
complete and all mechanical checks pass, with no exact-safeguard violation or invalid
candidate selection, and its size is selected in at least **two eligible fixtures**,
at least **three of ten repetitions** in each, for that provider. This screen is
frozen before inference. It measures usage, not strength. Keep both independently
qualifying candidates separate. Partial runs cannot qualify.

Promotion requires a separately planned and authorized full-hand study against a
frozen baseline with paired deals and seat rotations, separate heads-up/six-seat
results, varied opponents, production equity budgets, uncertainty estimates and
predeclared budget/strength/regression gates. Jev evidence cannot justify LLM
promotion; LLM needs its own evidence. A subsequently accepted Jev menu must be
applied consistently to Jev/Eevo through the shared implementation, retaining model
identities, confidence advice and exact safeguards and explicitly recording Eevo's
lack of paid behavioral/strength evidence. Version changed policies/menus then.
`current` stays available internally for code rollback with no schema migration.
Combining additions requires a separate combined-menu evaluation.

## Validation and attribution

Run `npm run check`, offline `BOT_SCENARIO_LIVE=false npm run test:bots`,
`npm run benchmark:poker-context`, and `npm run benchmark:bet-sizing`.
Run a build for deployment/bundling changes. Focused tests cover arithmetic,
bounds/deduplication, safeguards, menu agreement, provider errors, unchanged requests,
hidden-card invariance, Rules isolation, frozen inputs, durable allocation stopping
and partial analysis. Full provider HTTP strength is outside offline coverage.

This experiment implements the user's independent sizing-ablation design; it
reuses application code, not an external solver, chart, policy or dataset. The
[confidence-advice guide](../opponent-advice/production.md) documents the existing
Wilson-based advice and its attribution; the [context guide](../poker-context.md)
documents existing facts/equity/guidance sources. No new external strategic source
was used to choose these experimental bet sizes. Routine installed-framework
documentation informed the server-only boundary, not poker strategy.

## Node live-startup repair

The first launch (before the subsequently completed pilot) failed while importing an unrelated experiment's JSON manifest
through the shared preflight helper, before ledger creation or inference. The
connectivity helper is now standalone and tested through the actual Node live
branch with scripted HEAD responses and dummy credentials.
`preflight-import-failure-v1/` preserves the original plan/freeze.
`preflight-amendment.json` records the runner-only refreeze, zero sent requests,
and the unchanged decision-plan hash. Policies, fixtures, menus, models, order,
screening and 960-request allocation are unchanged. The prior offline evidence
remains bound to its original source hashes; this startup repair is separately
validated. No allocation was consumed by the import failure.
