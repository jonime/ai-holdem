# Paid production bot audit — 2026-10-15

The authorized frozen pilot completed **972 decision requests**, exactly 324 per
provider: **957 engine-accepted decisions and 15 failures**. There were no retries,
substitutions, compatibility probes, additional observations or interrupted slots.
All failures were Eevo's `HU-river-board-split` fixture. The authorization is exhausted.
Production strategies, prompts, settings, APIs and database behavior are unchanged.

The measurements identify concentration, variability and integration leads. Three
repetitions do not establish significance, stable mixing frequencies, exploitability,
GTO accuracy or playing strength.


The saved freeze describes the completed run before integration with newer `main`
changes. Integration retained dependency and bot-information updates through
`0983160`; `package.json`, `package-lock.json` and the twelve game dictionary
modules therefore differ from their recorded hashes. The original
freeze, input plan and evidence remain unchanged. Live execution intentionally
rejects this drift; reproducing the paid run requires its recorded source and
fresh authorization. Offline analysis of the saved evidence remains available.

## Evidence and reproduction

- [Sanitized request ledger and manifest](live-evidence-2026-10-15.json.gz).
- [Derived analysis](live-analysis-2026-10-15.json.gz).
- [Source freeze](freeze.json) and [972-slot controlled-input plan](pilot-plan.json).
- [Preserved offline report](offline-report-2026-10-15.md) and
  [offline observations](offline-evidence.json.gz).
- [Method, transformations, privacy and execution guards](README.md).

Regenerate every recorded distribution, entropy, repeat-agreement value,
conditional hand composition, paired TV comparison and reliability summary without
credentials, environment-file loading or inference:

```sh
npm run benchmark:bot-audit:analyze -- \
  benchmarks/bot-audit/live-evidence-2026-10-15.json.gz /tmp/bot-audit-live-analysis.json
```

The gzip ledger SHA-256 is
`d67724c42d37ab94b77616c15c071d816259d7ebd475fe543de5893a6df6af17`.
The plan SHA-256 is
`9da14c8c8e821d4615fdc5bc0fff24c8ac499795db51902b2ce020823d43bdf9`.
Every ledger slot matches its frozen provider, fixture, representation, repetition
and input hash; every slot records exactly one transport request. All 204 frozen
source-file hashes still match. Preserve the local ledger; do not remove it or
reuse this authorization to start another run.

## Mechanical invariants and preprocessing

All **60/60** inverse-normalized mechanical checks passed before inference:
legal bounds, prices, position/history, facts, statistics, advice references and
candidate action/size menus agreed. Historical states and hidden opponent holdings
did not enter provider requests. Each representation received the same canonical
5,000-sample equity value for its fixture.

Native provider preprocessing changed its MC estimate in 34/60 checks, with a
maximum absolute difference of 0.0166 equity share. Those native differences are
recorded separately and did not vary across the controlled paid inputs. Rules'
native legacy history/hash differences remain an offline result, not a provider
reasoning error. See the offline report for its 17,811 decisions and four residual
controlled `4-turn-draw` contrasts.

Jev and Eevo each made 75 decisions whose current confidence envelope contained
qualifying opponent-advice items. Absent and insufficient observations were also
included. LLM retained its current shared guidance and session statistics, without
the Jev/Eevo confidence envelope. This matrix has no advice ablation; comparisons
across different fixtures cannot establish advice's causal effect.

## Representation sensitivity versus same-input variation

Each provider has 60 representation cells (12 fixtures × five representations),
three scheduled observations per cell, and 48 variant-versus-original contrasts.
TV compares empirical **action-and-size** distributions on complete matching
repetitions only. Original same-input disagreement is the mean fraction of unequal
output pairs among three observations of each original input. These are different
descriptive statistics; they are not a noise-corrected effect or significance test.

| Provider | Repeat-stable representation cells | Stable original cells | Original pair disagreement | Positive TV / comparable contrasts | Mean TV | Complete / excluded pairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Jev | 54/60 | 10/12 | 11.1% | 6/48 | 0.0486 | 144 / 0 |
| Eevo | 55/55 successful; 5 failed | 11/11 successful; 1 failed | 0.0% | 0/44; 4 unavailable | 0.0000 | 132 / 12 |
| LLM mini | 32/60 | 8/12 | 22.2% | 23/48 | 0.2083 | 144 / 0 |

Across providers, **420 matching pairs were complete and 12 excluded**. Eevo's
four unavailable contrasts are not zero-distance observations. Every positive-TV
contrast for Jev or LLM had observed same-input variation in at least one of its
two cells; there were no contrasts where two individually repeat-stable cells
selected different outcomes. This is a caution about the three-observation sample,
not proof that representation never matters.

Jev's six positive contrasts all change action-type distributions, rather than
only size distributions. LLM has nine positive action-type contrasts (mean TV
0.0764) versus 23 action-and-size contrasts: fourteen show distribution changes
only when sizes are distinguished. Its action type is repeat-stable in 49/60
representation cells, versus 32/60 for exact action and size.

Concrete investigation cases:

- **Jev `3-preflop-suited`, seats:** the original selects raise-to-2-BB twice and
  call-1-BB once; the cyclic-seat version calls in all three observations
  (TV 2/3). The original already varies. The other Jev differences concern this
  fixture and `6-preflop-offsuit`; they do not support a general positional or
  suit-reasoning defect.
- **LLM `4-turn-draw`, hole order:** original outputs bet 1⅓ BB twice and bet
  2⅔ BB once; reversed holes produce check twice and bet 2 BB once. Action-and-size
  TV is 1; action-type TV is 2/3. Original sizing and reversed outputs both vary.
  Prioritize a larger, separately authorized fixed-equity replication; no stable
  frequency or action-value conclusion follows here.
- **LLM `5-river-board-kicker`, seats:** the original checks 3/3; the seat variant
  checks 2/3 and bets 5 BB once. This board-only/kicker outlier merits inspection,
  but its intent cannot be inferred without retained reasoning, and one bet does
  not establish an EV error.
- **LLM `HU-turn-capped-call`, hole order:** original calls exactly 4 BB in 3/3;
  the reversed version calls twice and folds once. Other representations call
  throughout. Jev and Eevo fold all 15 versions of this fixture. Prices and menus
  match; without an opponent-range/action-value reference this is not a proven
  pricing or strategic error.
- **Eevo:** no differences were observed among its comparable successful cells.
  This does not establish universal invariance, and the failed river-split cells
  cannot contribute a decision comparison.

## Starting-hand predictability

These are **conditional on the selected 24 classes**, each represented by one
physical holding. Per node, pair/suited/offsuit weights sum to 188 and the three
repetitions give weighted mass 564. The frame's prior category composition is
19.15% pairs / 17.02% suited / 63.83% offsuit. Neither the subset nor its weighted
summary is a complete opening range or an enumeration of physical combinations.
No GTO frequencies or action EVs were supplied or invented.

| Provider / node | Fold | Call | Raise | Cross-class H(action), bits |
| --- | ---: | ---: | ---: | ---: |
| Jev / button opening | 6.38% | 38.65% | 54.96% | 1.258 |
| Jev / BB facing 3 BB | 14.89% | 81.91% | 3.19% | 0.804 |
| Eevo / button opening | 0.00% | 0.00% | 100.00% | 0.000 |
| Eevo / BB facing 3 BB | 6.38% | 78.72% | 14.89% | 0.934 |
| LLM / button opening | 0.00% | 0.00% | 100.00% | 0.000 |
| LLM / BB facing 3 BB | 2.13% | 27.30% | 70.57% | 0.984 |

This cross-class entropy describes concentration across different holdings. It
is separate from mean within-cell H(action,size): Jev 0.191 bits, Eevo 0.000,
LLM 0.762 across the 48 preflop cells. Exact action/size repeat agreement is
38/48, 48/48 and 14/48 respectively. LLM action-type agreement is higher, 41/48:
much of its variation changes size while retaining the same action type.

Action-and-size concentrations:

- **Jev opening:** 46.45% weighted raise-to-2-BB, 8.51% shove-to-100-BB,
  38.65% complete the 0.5-BB blind, 6.38% fold. AA and KK shove 3/3 each;
  JJ shoves twice and completes once. All eight observed opening shoves are
  these three pairs. **Jev BB defense:** every observed re-raise is a 100-BB
  shove with AA (3/3); other successful outputs call or fold. This is a concrete
  size/hand-concentration lead, not proof that its EV or mixing is wrong.
- **Eevo opening:** every selected class raises. The 2-BB size occurs only with
  **22 and 72o**, 3/3 each; every other selected class raises 3 BB. Thus the
  observed 2-BB bucket's weighted class composition is one-third 22 / two-thirds
  72o. This strong size signal is conditional on this selected frame. In defense,
  re-raises are all to 9 BB, with AA, KK, QQ, JJ or AKs; 72o folds 3/3.
- **LLM opening:** all observations raise, with weighted sizes 35.46% to 2 BB,
  41.84% to 2.5 BB and 22.70% to 3 BB. AA raises 3 BB and 72o raises 2 BB in
  all three observations each. In defense, 9/7/6/5-BB re-raises contribute
  30.50% / 20.21% / 9.57% / 10.28% of weighted observations; calls contribute
  27.30% and folds 2.13%. There are no observed LLM shoves. The 72o defense
  calls twice and folds once; neither this nor its broad re-raising establishes
  a stable mixing frequency or decision quality.

Hand-category composition conditional on **raising**:

| Provider / node | Pairs | Suited | Offsuit |
| --- | ---: | ---: | ---: |
| Jev / opening | 17.42% | 24.52% | 58.06% |
| Jev / defense | 100.00% | 0.00% | 0.00% |
| Eevo / opening | 19.15% | 17.02% | 63.83% |
| Eevo / defense | 85.71% | 14.29% | 0.00% |
| LLM / opening | 19.15% | 17.02% | 63.83% |
| LLM / defense | 22.61% | 20.10% | 57.29% |

Full hand-class composition conditional on every action and size is in the derived
analysis. Model-derived probability diagnostics remain **separate** from all
empirical frequencies above: 324 Jev and 309 Eevo observations contain those
vectors; LLM supplies none. They are not calibrated poker mixing frequencies,
winning probabilities or an EV reference.

## Operational reliability and model metadata

| Provider | Requests / accepted decisions / failures | Median / p95 wrapper latency | Returned model identifier coverage | Reported request cost coverage |
| --- | ---: | ---: | --- | --- |
| Jev | 324 / 324 / 0 | 274 / 385 ms | `jev-1.13.0`, 324/324 | Not captured, 0/324 |
| Eevo | 324 / 309 / 15 | 795 / 1,471 ms | `eevo-1`, 309/324; failures unknown | Not captured, 0/324 |
| LLM | 324 / 324 / 0 | 3,627 / 6,990 ms | `openai/gpt-5.4-mini`, 324/324 | 0.7896123 credits, 324/324 |

Latency covers the bot wrapper/transport and includes failures; initial fixture and
5,000-sample context preparation is outside these per-decision timings. The entire
live benchmark took 1,855.09 seconds. Provider tokenizers/accounting differ: Jev
reports 1,781,907 input and 25,619 output tokens; Eevo reports 1,071,702 input and
zero output tokens for its 309 successful calls; LLM reports 954,108 prompt and
84,765 completion tokens (1,038,873 total). These are returned metadata, not
comparable work units or independent billing verification.

OpenRouter's reported request cost is **0.7896123 USD-denominated credits** (about
$0.79). Its [usage accounting documentation](https://openrouter.ai/docs/cookbook/administration/usage-accounting)
defines `usage.cost` as the amount charged, and its [support guide](https://openrouter.ai/support)
describes USD-denominated credits. Total pilot cost is **unknown** because Jev/Eevo
costs were not captured; missing coverage is not zero cost. Source hashes and
returned model labels cannot guarantee unchanged remote model weights.

All fifteen failures are Eevo `HU-river-board-split`, across five representations
and three planned repetitions: **15/15 fail here, 309/309 succeed elsewhere**.
This fixture has only the protected call candidate. The frozen error normalizer
records `provider`, which does not distinguish HTTP refusal from local response
validation or another integration cause. No raw responses, exceptions or reasoning
were retained, so singleton-menu incompatibility is a hypothesis, not an established
root cause. Jev and LLM both return the protected 99-BB call in all fifteen versions.
No failure became a substitute action, and all failed attempts consumed allocation.

## Findings by bot and separate follow-ups

- **Jev:** prioritize the 100-BB AA/KK/JJ opening sizes and AA-only defensive
  shoves for independent action-value and size-sensitivity evaluation. Investigate
  `3-preflop-suited` seat sensitivity with more repetitions and matched same-input
  controls; this pilot's positive contrasts all involve variable original inputs.
- **Eevo:** first isolate the forced-split integration failure with safe HTTP/parser
  stage diagnostics and a singleton-choice contract check. Any paid compatibility
  probe requires new authorization. Separately replicate the 22/72o 2-BB size
  signal across physical combinations and more weak classes before generalizing.
- **LLM:** prioritize `4-turn-draw` hole-order outputs and the isolated board-kicker
  and capped-call outliers. A separately budgeted larger replication should report
  action-type and sizing variation separately, alongside original controls. Do not
  treat its zero-fold selected opening subset as a complete range.
- **Equity Rules:** preserve the offline leads: UTG premium-hand folds (medium
  folds KK/QQ/AKs/AKo and only calls AA) and deterministic `4-turn-draw` changes
  under seat/amount transforms after fixed equity. Trace features, thresholds and
  hash seeds offline before considering any production change.

These are proposed separate experiments, not additional authorized calls or
production fixes. In particular, more menus, adaptive matches and mixing changes
are outside this audit. GTO Wizard's conceptual distinction between EV and
frequency mistakes remains the [interpretation basis](README.md#interpretation-and-attribution):
concentration alone measures neither strategic regret nor exploitability.

## Verification

The paid benchmark passed its 972-observation completion check (one test passed,
one offline test skipped). Credential/source/input preflight preceded all request
reservations. Exactly one transport request is recorded for every frozen slot;
there are no duplicates, uncompleted reservations or extra decisions. Reanalysis
of compressed evidence passed runtime observation validation. Its groups,
contrasts, predictability and reliability summaries reproduce the incremental
run summary. Production and frozen benchmark source files were unchanged during
execution; earlier `npm run check` (1,872 tests), offline scenarios, context and
full Rules audit results remain preserved in the offline report.
