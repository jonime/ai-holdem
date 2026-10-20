# Bot evidence review — 20 October 2026

**Recommendation: stop this improvement round.** No unresolved correction meets
all four requirements: an invariant/exact error, a surviving production path, a
deterministic reproduction, and a bounded correction. This does not establish that
the bots play well. It means the completed evidence does not justify another
intervention under this review's correctness standard.

This is an offline review at revision
`52eba61f912677df3720dd995ab4a43c0894645e`. No inference, match simulations,
study reruns, strategy/prompt changes or promotions were performed. Historical
model labels do not pin remote weights; current wrapper checks below establish
local contracts only.

## Findings

Classification uses these definitions:

- **Defect:** demonstrable decision or integration defect violating legality, an
  exact outcome calculation, visible-state representation or an established invariant.
- **Conditional:** conditional strategic hypothesis depending on ranges,
  continuation policies or uncertain estimates.
- **Operational:** provider, transport or validation failure, separately from poker quality.
- **Addressed/insufficient:** already addressed or insufficient evidence.

J41 means medium `typesafe-poker-v4.1-confidence` / returned `jev-1.13.0`;
E41 means `eevo-poker-v4.1-confidence` / returned `eevo-1` where successful;
M40 means balanced `llm-poker-v4.0-guided-balanced`, mini/low
(`openai/gpt-5.4-mini`). R2 means historical `EquityRulesV2Bot`; current registry
uses `OpeningAwareEquityRulesBot`, which preserves R2 except for the guarded KK
opening. Model/configuration differences are explicit where these abbreviations
do not apply. Chip amounts and BB amounts must not be interchanged.

| Affected bots | Fixture / observed action | Sample denominator | Policy/model version | Evidence / saved observations | Current-code applicability | Classification |
|---|---|---|---|---|---|---|
| Rules | Everyday decisions, including capped call 6 into contestable 24 despite live 206; multiway call cost 20 / contestable 70 | 20 fixtures × 3 difficulties = 60 checks; repeated runs are not new situations | R2, production 5,000 samples | [Scenario evaluation](scenarios/evaluation.md), [decision rows](scenarios/equity-rules-baseline.json) | [Strategy](../lib/bots/equity-rules/strategy.ts) uses legal call / contestable pot; no arithmetic defect demonstrated | Addressed/insufficient |
| Rules | Six-seat UTG medium folds KK/QQ/AKs/AKo, calls AA | Audit: one physical representative/class, 3 identical repeats; diagnosis: 5 named holdings at 5,000 and independent 20,000 samples | R2; legacy context | [Audit rows](bot-audit/offline-evidence.json.gz), [threshold diagnosis](bot-improvements/report-2026-10-15.md) | Five active opponents is correct; medium call threshold is 40% price + 5% margin. KK later addressed narrowly; other folds lack an exact action-value proof | Conditional |
| Rules | Medium KK fold → raise to 3 BB; hard QQ call candidate deferred | Per target 96 development + 240 confirmation blocks; 933 fixed checks across study | Frozen R2 / fold-only candidate, 5,000 samples | [Confirmation observations](preflop-candidate/confirm-v1.json.gz), [analysis](preflop-candidate/analysis-v1.json.gz), [promotion review](preflop-candidate/promotion-review-2026-10-16.md) | [Opening guard](../lib/bots/equity-rules-opening.ts) and [registry](../lib/bots/registry.ts) implement medium KK only. QQ's frozen-Rules adjusted interval includes zero | Addressed/insufficient |
| Rules | Medium AA fold at 100 samples becomes call at 1,000; smaller/opening actions change conditional returns | 500 primary seeds/group; sensitivity reuses first 100, not independent confirmation | Frozen R2, 100/1,000 samples, below production 5,000 | [Preflop report](preflop-action-value/report-2026-10-15.md), [saved results](preflop-action-value/evidence-v1.json.gz) | Not evidence that production folds AA; original 5,000-sample diagnosis calls. No universal premium-hand patch | Addressed/insufficient |
| Rules | `4-turn-draw`: original bets 2 BB; seat/chip transforms check at medium/hard with fixed equity | 4/144 controlled contrasts; 3 identical repeats/contrast. Follow-up: 3,840 transformed rows, 16 hand numbers | R2; canonical-seed benchmark candidate | [Audit observations](bot-audit/offline-evidence.json.gz), [follow-up observations](bot-improvements/offline-evidence.json.gz), [report](bot-improvements/report-2026-10-15.md) | Raw seat/chip history still enters the deterministic frequency hash. Candidate changes mixing assignments; per-input equality is not an established production mixing invariant | Conditional |
| Jev, LLM | Seat/hole-order sensitivity: Jev KQs raises 2/3 original vs 0/3 seats; mini turn draw bets 3/3 original vs 1/3 reversed holes | Audit 3/cell; follow-up 10/cell/arm over 4 fixtures × 3 representations; 600 total follow-up calls including premiums | J41, M40; benchmark canonical arm | [Audit ledger](bot-audit/live-evidence-2026-10-15.json.gz), [follow-up ledger](bot-improvements/live-evidence.json.gz) | Current wrappers retain physical representations. All positive audit contrasts involve variable cells; identical canonical input hashes still yield variable provider outputs. No demonstrated wrong visible fact | Addressed/insufficient |
| LLM | Five-way `5-river-board-kicker`: original checks 3/3; seat variant checks 2/3, bets 5 BB once | Follow-up baseline checks 30/30; canonical checks 28/30, bets 2/30 | M40 | Same two ledgers above; [follow-up discussion](bot-improvements/report-2026-10-15.md) | This is multiway, outside HU exact restrictions. Bluff returns depend on folds; neither intent nor an exact error follows from the bet | Conditional |
| Jev, Eevo, LLM | `HU-turn-capped-call`: Jev/Eevo fold all 15 audit observations each; mini calls except one reversed-hole fold | 5 representations × 3 each; mini follow-up calls 25/30 baseline, 27/30 canonical | J41, E41, M40 | [Audit ledger](bot-audit/live-evidence-2026-10-15.json.gz), [follow-up ledger](bot-improvements/live-evidence.json.gz) | Correct capped price does not establish required equity against a betting range; actual hidden holding/runout cannot grade this turn | Conditional |
| Eevo | `HU-river-board-split`: no decision, generic `provider` failure with call-only candidate | 15/15 failures on one fixture (5 representations × 3); 309/309 successful elsewhere | E41; failure rows have no returned model | [Paid report](bot-audit/live-report-2026-10-15.md), [15 saved failure records](bot-audit/live-evidence-2026-10-15.json.gz) | Shared candidate path still exists. Saved category cannot distinguish HTTP refusal from response validation. Current double success cannot resolve historical cause/current provider behavior | Operational |
| Jev, Eevo, LLM, Rules | Forced-split calls, exclusive nuts calls, certain-loss folds and free checks | Audit 60/60 representation mechanics; historical context pilot 640 fixed attempts with 3 provider failures and no recorded exact-river violations; current focused checks below | R2/J41/E41/M40; context pilot v4.0 variants, nano minimal/low and mini low | [Context pilot](heads-up-pilot-2026-10-14.md), [snapshot](evidence/heads-up-pilot-2026-10-14.json), [audit observations](bot-audit/offline-evidence.json.gz) | [Exact enumeration](../lib/poker/adapter.ts), [shared candidates](../lib/poker/decision-candidates.ts), Rules protections already cover the demonstrated HU cases | Addressed/insufficient |
| Jev, LLM | Advice changes aggression; Jev takes 17 all-ins under frequent-fold advice vs 0 baseline, including 12 postflop bets of 10,082 into 4 | Corrected v2: 960 calls; 60 policy pairs/history/provider; 50 advice-eligible decisions/cell; 5 repeats/fixture | Jev v4.0 / `jev-latest`; M40; `opponent-fold-advice-v1`, corrected fixtures v2 | [Corrected report](opponent-advice/live-v2-report-2026-10-14.md), [saved rows](evidence/opponent-advice-v2-live-2026-10-14.json), [metadata](evidence/opponent-advice-v2-metadata-2026-10-14.json) | Current [confidence advice](../lib/poker/opponent-advice.ts) includes deep-stack sizing cautions; neither caution text nor legal all-ins prove profitable adaptation. Sparse-history action changes do not establish inferred intent | Conditional |
| Jev, LLM | Earlier advice pilot: 721 network failures, 239 decisions; omitted control also removed HERO statistics | 960 reservations, only 119/480 complete policy pairs | v1 advice controls; Jev v4.0 / mini low balanced | [v1 report](opponent-advice/live-report-2026-10-14.md), [control audit](opponent-advice/report.md) | Corrected benchmark controls and first-failure/preflight guards exist. Exclude failed/confounded contrasts; do not pool with v2 | Operational (network); Addressed/insufficient (control) |
| Jev, LLM; Eevo offline only | Memory pilot: one complete mini/frequent-folder block +22.92 BB/100; Jev has zero eligible confidence signals | 1/6 started blocks complete; 2,609 reserved requests, 2 unresolved failures; 609 Jev enabled decisions with zero advice activations | J41; M40; rolling 50-hand statistics | [Session report](session-adaptation/pilot-report.md); its three local ledgers are absent from this checkout | Shared [statistics](../lib/poker/session-stats.ts) and advice require situation-specific opportunities. Exposure/budget missingness prevents strength inference; no paid Eevo evidence here | Addressed/insufficient; Operational for two failed requests |
| Jev | HU AA/KK openings shove to 100 BB | Exactly 18 historical requests: 9 AA + 9 KK, one physical holding each; sizing development 96 deals/holding, 4,608 rollouts total, 0 confirmation blocks | J41; follow-up uses Rules/conservative hero substitutes, not Jev continuations | [Deduplicated motivation](jev-preflop-sizing/motivation-v1.json.gz), [latest report](jev-preflop-sizing/report-v1.md), [analysis](jev-preflop-sizing/analysis-v1.json.gz), [empty selection](jev-preflop-sizing/selection-v1.json) | Current opening menu still offers all-in. Every smaller size fails the all-six-cell positive-mean gate; negative means vs Rules/conservative remain. Shove is not proven optimal or an exact error | Conditional |
| Jev, LLM; Eevo offline only | Added quarter-pot/1.5-pot: Jev selects neither; mini selects quarter-pot 13 times, 1.5-pot never | 960 calls; 120 eligible decisions/provider/addition; 10 repeats/fixture; mini ≥3/10 in 3 fixtures | J41, M40; separate menu arms | [Usage report](bet-sizing/live-report-2026-10-16.md), [saved ledger](bet-sizing/live-evidence-2026-10-16.json.gz), [offline compatibility](bet-sizing/offline-report.md) | Production still uses current menu. Usage is not quality; no Eevo behavioral inference from scripted compatibility | Conditional |
| LLM | Quarter-pot river screen: `2-river-0` gains in 2/27 assumptions, loses in 25; `2-river-1` gains in all 27 | 40 reused decisions, 10/menu/fixture; 990 holdings/fixture, 27 conditional comparisons/fixture | M40, same bet-sizing observations | [Extracted originals](llm-quarter-pot/observations-v1.json), [review](llm-quarter-pot/review-2026-10-20.md), [terminal archive](llm-quarter-pot/saved-evidence-v1.tar.gz) | First fixture fails unchanged both-fixture gate. Exact conditional enumeration cannot establish actual opponent responses or a universally better size | Conditional |
| Rules | Coordinated river bet 27 beats baseline 20 in discovery; larger unbeatable-straight bets fail later development gate | Discovery reuses 36 roots across 252 assumptions; candidate has 48 shared situations/difficulty, 33/48 activate, 0 confirmation situations | Current opening-aware Rules at 5,000 samples; frozen river candidate v1 | [Discovery observations](river-lookahead/evidence-v1.json), [candidate analysis](river-candidate/analysis-v1.json.gz), [closing review](river-candidate/review-2026-10-19.md) | All difficulties fail polarized/current-Rules cell. Discovery's 0.2–1 BB forced-split gains assume opponents fold a guaranteed chop; not an exact justification to remove protections | Conditional |
| Rules | Structured/facts challenger gains in some matchups and loses against passive controls; supplied ranges change 10/21 fixed actions/sizes | 500 shared seeds/group; 108,000 hand comparisons, 0 excluded blocks; separate 21 range contrasts | Frozen/facts/structured benchmark v1, 100-sample match equity | [Ablation report](equity-rules/report-v1.md), [saved observations](evidence/equity-rules-v1-2026-10-14.json.gz), [range calculation report](range-equity/report-v1.md) | Production has no range-inference path or promoted bundled challenger. Range calculator's exact/reference checks validate arithmetic conditional on inputs, not calibrated opponent models | Conditional |

## What the experiments collectively establish

Visible-state and legal-menu mechanics have substantial deterministic coverage.
They do not establish overall strength, population mixing frequencies or action EV
against real opponents. Exact conditional river values still depend on ranges and
responses. In particular, an unbeatable hand does not prove that increasing its
bet extracts more chips. The larger river candidate's failed development gate
and the quarter-pot screen's failed first fixture remain binding. The latest Jev
opening study likewise retains its empty selection and zero confirmation blocks.

The most concrete surviving failure is Eevo's operational split fixture, not a
demonstrated wrong poker decision. Its saved records lack the stage/response
needed for a deterministic current-cause reproduction. A fabricated malformed
response would demonstrate rejection, not reproduce what Eevo actually returned.
Fresh inference would be necessary to establish present remote behavior and is
unverified/deferred here. No singleton bypass, automatic fallback or safeguard
weakening is supported.

Rules' representation-sensitive deterministic choices are reproducible, but are
used as mixing seeds rather than visible-state facts. The original audit found
zero controlled fact/menu/price mismatches. The canonical-seed follow-up already
isolated this mechanism and found all 18 chip-comparison intervals included zero.
Treating equal actions for every relabeling as a new production requirement would
change the policy contract; the existing reports do not establish that invariant.

The separate [explicit Jev memory experiment](jev-heads-up-2026-10-14.md) adds
108 successful historical requests across six fixed situations, not action-value
evidence: frequent-folding versus calling had TV zero in all six situations.
No reusable full-action reference source passed that study's audit. This and
the session pilot's missing exposure cannot justify lowering confidence thresholds.

## Deduplication and provenance limits

The eighteen AA/KK motivation records identify their original source path and
slot. They comprise six audit observations plus twelve baseline/canonical
follow-up observations; the latest sizing report adds no provider observations.
The quarter-pot screen's forty records retain the original bet-sizing decision
IDs/input hashes and are not forty fresh calls. Follow-up representation calls
are new requests on reused fixtures, not new independent poker situations.
Reports, analyses and archived copies of a ledger count only once.

Three identical Rules repeats demonstrate determinism, not recurrence across three
situations. Likewise, Eevo's fifteen failures concern one situation, not fifteen
independent failure modes. Seed blocks, transformed inputs, range/profile cells,
and suit/hand-number strata retain their original statistical units. The old
100-sample AA fold is not substituted for production-budget behavior.

Saved audit/follow-up rows, sizing rows, extracted observations, promotion
analysis and both river analyses were inspected selectively. The session pilot's
gitignored ledgers are unavailable here; its +22.92 and request/exposure counts
are report-level evidence only, not independently revalidated raw observations.
They support no selected claim of correctness or strength. Historical snapshots,
including older documentation's pre-promotion language, remain unchanged; the
promotion review and current registry resolve present applicability.

## Minimal deterministic checks of apparent exact failures

No unresolved defect reproduction is claimed. Existing engine-backed scenarios
provide smaller counterchecks of the plausible exact leads without another study:

1. **Royal board facing all-in:** use `royal-board-facing-all-in` in the
   [scenario utilities](scenarios/harness.ts), HERO `7d 2h`, board
   `As Ks Qs Js Ts`. Enumerating all `C(45,2) = 990` compatible opponent holdings
   gives minimum = maximum = 1/2. At the decision, live pot is 202 chips, call
   is 198, contestable pot after call is 400. Incremental call value is
   `400/2 - 198 = +2` chips relative to folding. The engine's 200/200 split is
   a terminal-accounting check, not a grade based on the fixture's hidden hand.
   Expected and actual: protected call; no fold or raise candidate.
2. **Certain river loss:** `board-quads-low-kicker-facing-all-in`, HERO
   `3d 3h`, board `2s 2h 2d 2c 3s`. Only one three remains unseen; every legal
   two-card opponent holding has a higher kicker. All 990 holdings beat HERO,
   so maximum share is zero and calling loses its entire 198-chip payment.
   Expected and actual: call removed. A generic “board quads always ties” rule
   would be wrong; the current exact evaluator avoids it.
3. **False nuts from sampled equity:** HERO `As 2d` on `9s 8s 7s 6s Kh`
   can lose to a straight flush despite sampled equity being 1. Expected and
   actual: minimum 0, maximum 1; both fold and call remain available.
4. **Provider doubles:** Jev's tests reject removed moves instead of replacing
   them; LLM tests exercise engine-backed scenarios in every playstyle, with
   request schema and parser restrictions agreeing. Eevo confidence-wrapper
   tests compare its candidates/context to Jev and preserve malformed-response
   and network failures with one request. These are local contract checks; the
   Eevo tests do not reconstruct its historical split failure response.

Executed quick focused command (37.78 seconds, 4 files / 102 tests passed):

```sh
nice -n 15 env BOT_SCENARIO_LIVE=false EXTERNAL_INFERENCE_ENABLED=false \
  npm test -- --maxWorkers=1 lib/poker/river-share.test.ts \
  lib/typesafe/river-candidates.test.ts lib/bots/llm-scenarios.test.ts \
  lib/bots/eevo-confidence.test.ts
```

The host refused the `nice` priority adjustment; the bounded single-worker tests
nevertheless completed. No network provider was used: external wrapper tests
inject doubles. No reproduction code was added. This documentation-only change
requires document/link verification, not a full `check`, build or long evaluation.

Document verification passed: all 53 relative links in this review and all 31
links in the benchmark index resolve. Saved-row checks independently verified the
audit's 324/provider allocation and fifteen Eevo failures, Jev advice's 17 versus
zero all-ins, the eighteen motivation-record origins, all forty extracted
quarter-pot records against their original rows and input hashes, the river
candidate's 33/48 activation and defer verdicts, and Jev's empty selection.
`git diff --check` passed; only this new review and the index changed.

## Decision

**Stop this improvement round.** No correction is selected, so there is no
implementation or promotion plan. Preserve the conditional leads and operational
unknowns above without converting them into another sizing experiment. A later
round would need new invariant evidence or separately authorized provider-stage
evidence; neither is established or requested by this review. No win-rate gain is
estimated and no completed experiment's gate or conclusion is changed.
