# Explicit heads-up Jev experiment — 2026-10-14

This is evaluation-only. Production Jev, Equity Rules, models, settings, registry,
public contracts and SQL are unchanged. The earlier
[heads-up pilot](../heads-up-pilot-2026-10-14.md) and its evidence remain unchanged.

**Outcome:** no candidate passed the full-action chart audit. Supported chart
configurations: **none**, including 10/25/100 BB. Chart decision and match calls
are deferred. After credential setup, the memory experiment completed **108/108
successful Jev requests**, with no retries or substitutions. Frequent-folding and
frequent-calling histories produced identical enabled-statistics action
distributions in all six situations. This narrow, three-repetition sample does
not demonstrate useful opponent-specific adaptation or stronger play.

See the [dated recommendation](../jev-heads-up-2026-10-14.md),
[live memory evidence](../evidence/jev-hu-memory-live-2026-10-14.json) and checksum
manifest. The first attempt lacked `TYPESAFE_API_KEY` in the benchmark environment;
its [separate credential-failure ledger](../evidence/jev-hu-memory-2026-10-14.json)
preserves 108 local failures and **zero provider HTTP requests**. The user supplied
the key and requested continuation, after which a separate one-run live ledger
was used. Its 108 provider requests are the complete paid experiment; the older
ledger's `usedRequests` counts conservative local reservations, not HTTP sends.
No provider request was replayed from that ledger. Credential preflight now runs
before reservation. The unused chart allocations remain unspent. Do not roll out
a chart policy from this experiment.
## Source audit

[Source inventory](../evidence/jev-hu-sources-2026-10-14.json) pins repositories and
records code/data terms separately. None of their strategy data is imported for
play or grading. Audit observations are not proof that an equilibrium is correct.

- [amaster97/poker_solver](https://github.com/amaster97/poker_solver/tree/f78f1b2bc338dd8cbb5226ecb8398bbdb3635676):
  candidate rejected after reading the generator and Rust preflop kernel. Its
  matched non-all-in contributions terminate at equity leaves. A separate
  postflop solver/chaining API does not make those blueprint leaves model
  postflop betting. The precomputed grid includes 100 BB but lacks exact 10/25 BB.
  MIT covers software/documentation; no separate express dataset grant was found,
  so asset redistribution is not assumed from the code label.
- [hellomate2/gto-poker-overlay](https://github.com/hellomate2/gto-poker-overlay/tree/e4b8791dc1bbbfcf4c92fff79a83821ee0194fc3):
  chart source explicitly encodes range strings instead of a solve. Exact depth,
  solver provenance, mixed frequencies and convergence are undocumented. Rejected;
  MIT code is not evidence of provenance or permission for upstream chart data.
- [holdemmath-data](https://github.com/Julian-cloud-max/holdemmath-data/tree/7c72b1261f08c63cf8366120dc531631935c21cd):
  explicitly licensed code/data, but its HU game is shove/fold. Rejected as a
  substitute for full-action opening/BB-response charts.
- [chirenonhive/poker-solver](https://github.com/chirenonhive/poker-solver/tree/6d54d3725c50d5e74c8971723a616eb52d664f3c):
  repository documentation states its postflop leaves use positional realization
  factors, defaulting to full all-in equity. Rejected before data ingestion.
- [PokerCoaching chart listing](https://pokercoaching.com/tools_old/downloadable-preflop-charts/):
  lists 100 BB HU/no-ante charts, but no reusable dataset license, no-rake guarantee,
  exact action tree or convergence evidence was verified. No access purchased,
  no chart copied. Its 25 BB listing is nine-handed with ante, not this game.

Independent structural inspection of the pinned 100 BB/no-ante candidate checked
34,814 frequency rows across 206 nodes, finite [0,1] values, action-vector lengths,
normalization, action-label grammar and manifest checksum. Maximum sum error was
5.56e-16. Representative button opening and BB responses at 2/3 BB for AA, AKs and
72o were inspected separately; action labels use 100 chips per BB and total
bet/raise commitments, while calls pay the outstanding difference. The generator
subtracts blind contributions from starting stacks. Its manifest reports 25,000
iterations and null final exploitability. Plausible strong-hand entries and valid
frequencies cannot overcome the rejected postflop model. No independent full-game
EV oracle was available; no strategic correctness claim is made.

Reproduce the structural audit without solving:

```sh
python3 benchmarks/heads-up/audit-source.py /path/to/pinned/poker_solver /tmp/source-audit.json
```

The [verification artifact](../evidence/jev-hu-source-verification-2026-10-14.json)
contains checksums and representative entries. No solver was run in this project.

## Reference format and grading

`reference.ts` parses strict `hu-reference-v1` JSON with pinned source attribution,
separate redistribution terms, generation/convergence evidence, postflop model,
limitations and independent checks. Each node has an exact dealt-HU preflop key:
position, both starting stacks before blinds, effective stack, 0.5/1 blinds,
zero rake/ante, position-relative commitments and complete actor/action line.
All 169 canonical hand classes are mandatory. Actions use BB units: bet/raise to,
call additional. Frequencies must sum to one; optional EVs require a complete
menu plus BB-per-decision units, baseline and assumptions.

Parsing is a mechanics check, not source approval. A future source requires a
separate documented audit. Synthetic test references are explicitly not strategy
data and never authorize paid comparisons. No production module imports these files.

Matching uses adapter-validated history and public commitments, never hidden
opponent cards. Any positive-frequency action outside the engine or supplied
candidate menu makes the entire node unsupported. There is no stack interpolation,
sizing rounding, clamping or removal/renormalization of unavailable actions.
Unsupported hybrid decisions use unchanged current Jev. Advisory requests inject
only chart frequencies and assumptions into the frozen Jev request; EVs stay in
the grader. Seeded injectable sampling is independent of Jev confidence values.
The sampler control covers individual fixtures; it is not a complete poker bot.

`decisions.ts` exercises all classes with 6/4/12 combination weights. Regret is
best available reference EV minus selected action EV, in BB/decision, only with
exact state, range assumptions and complete menu agreement. Unmatched actions
are ungraded. Without EVs, support and total-variation frequency distance are
strictly descriptive. Node-level development/held-out splits prevent sharing a
situation; freeze the dataset and selected held-out fixtures before any paid run.
Select at most 40 supported held-out decisions, round-robin by situation, with
three repetitions of current/advisory (240 maximum). Hybrid control is offline.

## Full-hand comparisons

`chart-matches.ts` wires both challengers against current Jev and cycles unchanged
Equity Rules plus fixed passive/aggressive opponents. Each challenger comparison
is a four-hand block: both policies play both seats, identical shuffled deck and
100 BB stacks. Current Jev receives empty prior-session statistics; within-hand
history remains intact. Equity Rules retains legacy context/sizing.

The shared runner has a 200-action emergency guard; no six-request/12-action
truncation is used. The new paired report excludes every incomplete block from
both win rates and differences. It reports completion, BB/100 and paired BB/100
differences per opponent, bootstrapping whole four-hand blocks (2,000 seeded
resamples). Fewer than 30 complete blocks are exploratory. Failures stay visible;
budget exhaustion stops the run and leaves unfinished blocks explicitly excluded.
The earlier pilot's implementation/evidence is retained for reproducibility.

## Memory contrast

Six frozen situations cover weak/suited/premium button opens and weak/suited/pair
BB responses. Twenty adapter-replayed hands produce frequent BB folding or
calling against 3 BB opens. Insufficient observations use a recorded opponent
identity change before the last four hands; continuity attribution discards older
observations. All histories are completed and validated by `projectSessionStats`.

The current hand's cards, stacks, line, equity calculation, within-hand history,
coverage and hero statistics are fixed across the three conditions. Only opponent
observations vary. Hero statistics use the canonical folding-history projection;
this is an explicit controlled intervention, not a claim that the three sessions
have identical realized hero actions. Omitted-statistics prompts are identical
across conditions. Current Jev runs enabled/omitted statistics three times each,
with counterbalanced order (108 attempts). Reports compare action distributions
and folding/calling total variation, including omitted controls for stochastic
variation. A changed action is not automatically beneficial. No independently
supported reference applies here, so quality grades are null.

## Commands and cap

```sh
npm run benchmark:jev:heads-up
npm run benchmark:poker-context
npm run test:bots
npm run check
# Only with a separately authorized fresh run and configured .env.test:
EXTERNAL_INFERENCE_ENABLED=true BOT_DECISION_CALL_CAP=108 npm run benchmark:jev:memory:live
```

The dated runner freezes policy dependencies/fixtures by SHA-256 and verifies them
before paid work. Jev stays `jev-latest`, medium difficulty, with production
guidance/session statistics. No other models are compared. Existing `.env.test`
loading and shell precedence remain; `.env` is not loaded. Existing 60-second
provider deadlines and fixed failure classifications remain. Reports never save
provider bodies, raw exceptions, identities, hidden cards or credentials.

`RequestBudget` reserves before each client request, counting failures and any
compatibility probes, with a global maximum of 1,000 and section maxima of
240/108/652. Hybrid sampling reserves nothing. The memory runner additionally
requires exactly 108 and persists each reservation before network dispatch;
an exclusive start marker prevents concurrent or accidental repeat paid runs.
No automatic retry, substitution or unbudgeted probe exists. Offline tests only
verify mechanics. See the [dated recommendation](../jev-heads-up-2026-10-14.md) and verification manifest for
checks and evidence limits.

The current offline `benchmarks/baselines/systemone-v4-freeze.json` includes the
additive completed-hand replay adapter methods. Existing decision, action and
projection methods and bot strategy are unchanged. Dated paid manifests and
evidence remain untouched; this offline hash refresh authorizes no live calls
and does not make historical paid runners compatible with changed sources.

The internal betting-menu injection retains the default current-menu requests,
verified against pre-refactor request hashes in `../bet-sizing/default-requests.json`.
Synthetic/current offline chart regressions use the separate
`../baselines/systemone-v4-menu-injection-freeze.json`; the preceding regression
manifest and all dated paid manifests/evidence remain unchanged. This does not
rebind historical evidence or authorize inference. Historical source verification
still requires the original source bundle.
