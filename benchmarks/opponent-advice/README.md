# Confidence-aware opponent advice (Plan 3)

This independent benchmark tests interpretation of existing observations, with no
production provider, prompt, selection, persistence, public-contract or model changes.
It preserves earlier context/heads-up evidence. Promotion needs a later evidence-based plan.
The [complete corrected pilot report](live-v2-report-2026-10-14.md) records 960
successful additional calls, Jev's behavioral response and its extreme-sizing concern.

## Challenger and controls

`opponent-fold-advice-v1` uses the existing replay-validated
`poker-session-stats-v1` window (at most 50 completed hands), immutable identity and
ownership continuity, explicit opportunity denominators, forced-departure exclusions,
and separate dealt-heads-up/multiway buckets. No historical holdings or identities
enter requests. It never estimates ranges from VPIP or aggression.

At least ten relevant opportunities are required. With z = 1.959963984540054,
compute the two-sided 95% Wilson score interval. Add frequent-fold advice only
when its lower bound is strictly above 0.60; add frequent-continuation advice only
when its upper bound is strictly below 0.30. Otherwise add nothing. Advice names
one seat, folds/opportunities, interval and situation; pressure/value suggestions
remain qualitative and retain every candidate, exact safeguard and playstyle.
Wilson intervals are a conventional binomial uncertainty summary, not a guarantee
about correlated observations or future play. Thresholds are experiment choices.
The formula is checked against the
[NIST confidence-interval reference](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm).
No PokerSkill code, tables or strategy text is reused.

Preflop advice describes a BB's first response to a heads-up button opening:
each available concrete raise size uses its own <=3 BB or >3 BB evidence bucket.
No advice transfers across size buckets. This is a candidate-conditional observation,
not a rule to select that size. Postflop uses only the relevant street's faced-bet
folds and opponents still able to fold. Unknown current history suppresses advice.
Statistics bucket by dealt player count even when players subsequently fold.

Existing aggregates do **not** record multiway BB-opening fold observations.
Both multiway preflop situations deliberately suppress advice; no substitute metric
or invented multiway denominator is used. All multiway postflop advice identifies
only the observed opponent, never everyone's probability of folding.

## Fixed pilot

There are six heads-up and six three-player situations. Each family contains two
preflop, two flop (draw/made hand), one turn and one river decision. Versioned code
constructs 42 complete source hands through the engine and validates them with the
existing replay projector. The 42-hand sequence restores the same button rotation
for both table sizes. The sparse intervention changes ownership until the last four
hands; it does not invent aggregate counts. Hands use deep stacks to preserve all
participants throughout the synthetic recording.

Conditions are omitted statistics, insufficient evidence, frequent folding and
frequent continuation. A single canonical current hand fixes cards, stacks, line,
legal menu and prices for every contrast. HERO's validated statistics stay fixed;
unrelated opponents use a fixed unknown control from the existing projector.
Only the target opponent's projected counts change. These are controlled synthetic
histories, not an inference system or natural-playing-strength sample.

Two policies compare the frozen current wrappers and request-boundary advice.
Jev uses `jev-latest` (medium difficulty; provider-owned reasoning); LLM uses
`openai/gpt-5.4-mini`, low reasoning and balanced playstyle. Both retain one
provider request per decision and existing output contracts. Counterbalanced
provider/policy order alternates by fixture/repetition, while history order rotates.
Five repetitions give **2 × 12 × 4 × 2 × 5 = 960** maximum calls.

`freeze.json` records SHA-256 hashes of the current policy, context, transport,
fixture and runner sources. Both entry points refuse changed dependencies. This
is a reproducible source guard, not a new frozen production branch. Preserve the
sources at this revision to rerun it; do not rewrite old evidence hashes.

## Commands and authorization

```sh
npm run benchmark:opponent-advice
npm run check
BOT_SCENARIO_LIVE=false npm run test:bots
npm run benchmark:poker-context
```

The offline command forces live execution off, even if `.env.test` contains flags.
It tests the full matrix with scripted provider outputs. It makes no paid requests
and establishes wiring/legal safety only.

Paid execution requires **fresh explicit user authorization**, as specified in the
supplied plan. The initial implementation made no paid requests. The user subsequently authorized
one capped pilot; see [the live evidence report](live-report-2026-10-14.md).
The following **v1 command is archival** and its original allocation is exhausted.
Use the separately authorized v2 command below for the current corrected pilot.
Credentials belong in ignored `.env.test`; the confirmation token records the
operator's authorization:

```sh
EXTERNAL_INFERENCE_ENABLED=true BOT_DECISION_CALL_CAP=960 \
  OPPONENT_ADVICE_PAID_AUTHORIZATION=plan-3-960 \
  npm run benchmark:opponent-advice:live
```

Preflight requires both TypeSafe and LLM keys, the exact
`https://openrouter.ai/api/v1/chat/completions` endpoint, explicit inference flags,
and a positive cap <=960. Model, reasoning and playstyle are fixed in code;
production `LLM_BOT_MODELS` is untouched. OpenRouter disables fallback, requires
supported parameters and rejects unexpected returned model IDs. There are no
substitutions, automatic retries or additional compatibility probes; the first
experimental decisions double as compatibility checks. Every attempted decision,
including failure, consumes the same shared cap. Smaller caps reduce coverage.

Live reports default to `benchmarks/results/opponent-advice-live.json`.
`OPPONENT_ADVICE_REPORT` may specify a fresh `.json` basename in the same directory.
An exclusive `.started` marker prevents accidental repeat/spending on the same
run path. Freeze the exact public contexts, settings and input checksum in the
adjacent manifest before requesting. Save reserved attempts before inference and
partial sanitized rows after every decision and in `finally`. A crashed in-flight
request may have no result/cost; reserved count remains explicit. A fresh path is a
new paid run requiring new authorization, not an automatic resume.

## Evidence and interpretation

Reports include action/sizing distributions with denominators, matched policy
contrasts by situation/history/provider, missing/failed pair exclusions, successful
latency median/p95, sanitized token usage, and reported cost coverage against all
attempts. Provider failures retain only allowlisted categories. No raw responses,
credentials, hidden holdings, identities, tokens or engine states are exported.

Omitted-statistics policies receive identical requests and measure stochastic
variability. Insufficient observations also suppress advice; changed actions there
are flagged for unsupported-adaptation review, not automatically graded as errors.
Engine legality and provider candidate validation grade only established exact
failures. Ordinary changed actions, increased bluffing or altered sizes are ungraded.
The same candidate/river protections apply to both policies. No legal-action or
scripted-opponent result is presented as a solver/GTO reference.

The fixed-decision pilot measures **sensitivity and safety**, not win rate.
Recommend a separately authorized full-hand experiment only if paid results justify
it. Negative or inconclusive results are valid. See [the offline evidence report](report.md).
No build or SQL checks are required because this experiment changes no application,
routing, deployment or persistence behavior.


## Paid-run limitation and corrected controls

The authorized v1 run retains its original source freeze and inputs. Its first
721 recorded attempts failed under restricted network access. A separate
`opponent-advice-continuation.live.ts` runner skips those recorded cells and permits
only the remaining 239 unattempted cells with network access. It validates the
original input checksum and ledger, records a runner hash, and never resets the
combined 960 cap or retries failed cells. A second paid run is not authorized.

The v1 omitted condition removes the entire `sessionStats` field, including
HERO's image. This violates the intended fixed-HERO control in history-versus-
omitted contrasts. Within-condition policy pairs remain matched, and omitted
current/advice policy pairs receive identical requests; comparisons across v1
histories and omitted inputs must be treated as confounded.

`controlled-fixtures.ts` supplies `opponent-advice-twelve-v2`, omitting only the
target participant's observations while retaining identical HERO/unrelated
statistics, coverage, cards, stacks and line in every condition. It wraps the
unchanged v1 fixtures and has its own `freeze-v2.json`. Run
`npm run benchmark:opponent-advice:v2` for the corrected 960-decision offline
matrix. A focused test compares HERO/unrelated statistics in **all four** conditions.
The correction initially had offline evidence only. A subsequent explicit
user authorization permits one new 960-call v2 pilot, described below.
Paid v2 evaluation uses its own explicitly approved budget and frozen runner. Preserve the v1 evidence and do not relabel its
results as v2.


## Separately authorized v2 pilot

The user approved **960 additional calls** for corrected v2 controls, independent
of the exhausted v1 cap. The new `controlled-pilot.live.ts` verifies
`freeze-v2-live.json` and credential/model settings, then performs unauthenticated
HEAD connectivity checks before recording any inference attempt. Run only in an
environment permitted to access the provider endpoints.

```sh
EXTERNAL_INFERENCE_ENABLED=true BOT_DECISION_CALL_CAP=960 \
  OPPONENT_ADVICE_PAID_AUTHORIZATION=plan-3-960 \
  OPPONENT_ADVICE_V2_AUTHORIZATION=plan-3-v2-960 \
  npm run benchmark:opponent-advice:v2:live
```

Requests remain sequential, with one inference in flight. `run-safety.ts` shares a
stop condition across all providers/policies: the first provider failure is recorded
and stops all subsequent requests, without replay or retry. Connectivity failures
before inference consume no decision slots. Every attempted provider decision,
including a failure, still charges the new shared cap. Reports are saved atomically
to `benchmarks/results/opponent-advice-v2-live.json`, with a permanent `.started`
marker and a frozen input/source/model manifest. Partial results survive an early
stop. The runner requires a fresh path and cannot replay this authorized run.
The original v1 evidence remains separate and unchanged.


## Reproducible offline analysis

`analyze.mjs` reads a sanitized v2 report without loading environment files or
contacting providers. It separates action-type from sizing changes, preserves
failed/missing pairs and denominators, and reports descriptive aggression contrasts
only over advice-eligible fixtures. Omitted/insufficient policy pairs are stochastic
controls, not proof of unsupported behavior from a changed action alone.

```sh
node benchmarks/opponent-advice/analyze.mjs \
  benchmarks/results/opponent-advice-v2-live.json \
  benchmarks/results/opponent-advice-v2-analysis.json
```

The output records report and analysis-source checksums, token/cost coverage,
latency, action/sizing distributions and the difference between folding and
continuation advice effects. This is sensitivity analysis, not chip EV or a
population poker-frequency estimate. The original v1 report is not pooled with
v2 because its omitted-history control differs.


## Production promotion and archival reconstruction

The user subsequently requested production Jev promotion. See
[the production record](production.md) for the Jev-only wrapper and revised sizing
wording. Historical Plan 3 source dependencies are preserved by archival commit
`62d7bc6` (created after the run; not an execution-time commit identifier). The
freeze checks intentionally refuse current production sources because the registry
changed. Reconstruct offline experiments at that commit; do not rewrite archived
hashes or rerun exhausted paid allocations.
