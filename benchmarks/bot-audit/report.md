# Production bot audit — completed 2026-10-15

The audit completed 17,811 offline Rules decisions and the authorized **972 paid
requests**: **957 engine-accepted provider decisions and 15 failures**. Production
strategies, prompts, settings, APIs and database behavior are unchanged. The paid
authorization is exhausted; no further inference is authorized automatically.

Read the [paid report](live-report-2026-10-15.md) for distributions, concrete fixtures,
metadata, exclusions and follow-ups. The [offline report](offline-report-2026-10-15.md)
preserves the original Rules findings and checks before paid execution.


The saved freeze describes the completed run before integration with newer `main`
changes. Integration retained dependency and bot-information updates through
`0983160`; `package.json`, `package-lock.json` and the twelve game dictionary
modules therefore differ from their recorded hashes. The original
freeze, input plan and evidence remain unchanged. Live execution intentionally
rejects this drift; reproducing the paid run requires its recorded source and
fresh authorization. Offline analysis of the saved evidence remains available.

## Mechanical invariants

All 60 equivalent-representation checks passed for legal bounds, prices,
position/history, facts, statistics, advice references and normalized candidate
menus. Native MC equity varied in 34/60 checks, by at most 1.66 percentage points;
paid comparisons held the canonical 5,000-sample estimate fixed. Hidden holdings
and private historical states were absent from provider requests.

The 204-file source freeze and exact 972-slot input plan match the saved ledger.
Every slot made one request; there were no retries, substitutions, compatibility
probes, extra observations or interrupted reservations.

## Representation sensitivity

| Bot | Positive action-and-size TV / comparable paid contrasts | Bounded finding |
| --- | ---: | --- |
| Jev | 6/48 | Small observed distribution changes; all involve same-input variation. `3-preflop-suited` seat relabelling is the largest lead (TV 2/3). |
| Eevo | 0/44, four unavailable | No observed sensitivity in comparable successful cells. The fifteen forced river-split failures exclude twelve matched pairs. |
| LLM mini/low/balanced | 23/48 | Considerable sizing variability; only nine contrasts change action-type distributions. `4-turn-draw` hole order has full action/size TV but both cells vary. |
| Equity Rules | Offline: 16/144 native, 4/144 controlled | The four residual contrasts are medium/hard `4-turn-draw` seat and chip transforms: bet 2 BB becomes check. |

Paid original inputs themselves vary: exact action/size repeats agree in 10/12 Jev,
11/11 successful Eevo and 8/12 LLM original cells. No positive paid contrast has
two individually repeat-stable cells choosing different outcomes. With only three
observations per cell, these measurements do not establish significance or stable
mixing frequencies, and observed differences cannot be assigned uniquely to
representation instead of provider variability.

## Starting-hand concentration

Paid weights are conditional on the selected 24 classes and their fixed physical
representatives; they do not form complete opening ranges. Full hand-class and
size compositions are in the [derived paid analysis](live-analysis-2026-10-15.json.gz).
Model-derived probability vectors remain separate from empirical frequencies.

- **Jev:** AA and KK open-shove 100 BB in all three observations each; JJ does
  so twice. Its only observed BB re-raises are AA shoves, 3/3. These are concrete
  hand/size concentration leads for independent action-value evaluation.
- **Eevo:** raises every selected opening class. Only 22 and 72o choose 2 BB;
  the other selected classes choose 3 BB, consistently across repeats. No claim
  of exploitability follows from this selected-frame size signal.
- **LLM:** also raises every selected opening class, with 2/2.5/3-BB sizing
  variation. It re-raises 70.57% of weighted selected defense observations, but
  three repetitions cannot estimate a stable mixed strategy or establish EV.
- **Equity Rules:** medium six-seat UTG folds KK/QQ/AKs/AKo, only calls AA, and
  folds 99.55% of representative weighted mass. Inspect its multiway features and
  thresholds separately; deterministic behavior alone is not a failure.

## Operational reliability

Jev and LLM each succeed on 324/324 requests. Eevo succeeds on 309/324: every
failure is `HU-river-board-split` across five representations and three repetitions.
Its only candidate is the protected call. The generic captured failure category
does not reveal whether the cause is HTTP refusal or response validation; do not
claim singleton-menu incompatibility as proven. No failure became a fallback action.

Returned IDs are `jev-1.13.0`, `eevo-1` and `openai/gpt-5.4-mini` where decisions
succeeded. Local source and returned labels do not pin remote weights. LLM reports
0.7896123 USD-denominated OpenRouter credits (about $0.79); Jev/Eevo cost coverage
is absent, so the total cost is unknown. See the [cost sources and coverage](live-report-2026-10-15.md#operational-reliability-and-model-metadata).

## Reproduction and evidence

- [Method and commands](README.md), [source freeze](freeze.json),
  [controlled input plan](pilot-plan.json).
- [Paid sanitized ledger](live-evidence-2026-10-15.json.gz) and
  [derived analysis](live-analysis-2026-10-15.json.gz).
- [Offline sanitized evidence](offline-evidence.json.gz) and
  [preserved pre-paid report](offline-report-2026-10-15.md).

```sh
npm run benchmark:bot-audit:analyze -- \
  benchmarks/bot-audit/live-evidence-2026-10-15.json.gz /tmp/bot-audit-live-analysis.json
```

The paid completion check passed, reanalysis reproduces the saved summaries, and
all request/source/input hashes match. The unchanged code previously passed
`npm run check` (1,872 tests), offline `test:bots`, `benchmark:poker-context` and
the full offline audit. No build, SQL or browser changes were involved.

The [paid report](live-report-2026-10-15.md#findings-by-bot-and-separate-follow-ups)
describes separate follow-ups. No further paid experiments or production fixes
follow automatically. As explained in the [GTO Wizard attribution](README.md#interpretation-and-attribution),
concentration is not a measure of EV mistakes, frequency mistakes or exploitability.
