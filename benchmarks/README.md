# Benchmarks and bot evaluations

- [Production predictability and representation audit](bot-audit/README.md):
  offline production rules coverage, equivalent-input mechanics and a frozen
  972-request Jev/Eevo/mini pilot. Its [completed report](bot-audit/live-report-2026-10-15.md)
  records fifteen Eevo river-split failures; its paid authorization is exhausted.
- [Bot decision scenarios](scenarios/README.md): engine-backed legality and
  obvious-blunder checks, with opt-in live providers.
- [Confidence-aware opponent advice](opponent-advice/README.md): benchmark-only
  situational fold interpretation, offline controls and a separately authorized
  960-request Jev/mini pilot, preserved v1 limitations and corrected offline v2 controls.
- [Shared poker context](poker-context.md): Jev/LLM facts, advisory guidance,
  weighted preflop matrices and paired full-hand comparisons.
- [Equity Rules situation experiment](equity-rules/README.md): frozen/facts/structured
  ablations, whole-block bootstrap comparisons and separate range sensitivity.
- [Conditional range equity](range-equity/README.md): benchmark-only weighted
  holdings, joint rejection sampling, exact river checks and PokerKit validation.
- [Preserved benchmark evidence](evidence/README.md): dated sanitized run snapshots,
  metadata and interpretation for future comparisons.
- [Game-state reads](game-reads.md): SQL verification, request counts, latency,
  and reveal query plans.

## TypeSafe policy evaluation

Run the deterministic, cost-free policy benchmark with seeded deals and each
seat assignment:

```sh
npm run benchmark:policy
```

It compares the frozen v1 policy surrogate and the v2 exact-move policy
surrogate against `equity-rules-v2` plus scripted passive and aggressive
opponents. The JSON report includes big blinds won per 100 hands, a 95%
uncertainty interval, action frequencies, failures, and decision latency. This
is a regression harness for policy mechanics, not evidence that Jev plays
stronger poker.

The current registry Jev wrapper is `typesafe-poker-v4.1-confidence`, layered on
`typesafe-poker-v4.0`; Eevo uses `eevo-poker-v4.1-confidence` with the same
confidence-advice envelope. Easy mode samples the
provider distribution without adding uniform randomness; medium and hard use
the provider's selected move. Before asking Jev, exact heads-up river evaluation
removes folds when calling guarantees nonnegative chip EV, calls that lose to
every possible holding, and bets/raises on a forced board split when checking or
calling is safe. These are candidate restrictions; the engine remains the final
legality authority. Ordinary uncertain positions still use Jev's decisions.

LLM bots use policy `llm-poker-v4.0-guided-{playstyle}` and share these candidate
safeguards with Jev. The request schema and local response validation enforce
the same restricted action set for every playstyle. Jev and LLMs share versioned facts, exact sizing, selectively supplied advisory
guidance and bounded server-validated session statistics. Production model settings
are unchanged during the 640–1,000-request OpenRouter heads-up pilot; see the
[context benchmark](poker-context.md) for opportunity counts, model/cost comparison,
privacy boundaries and research limits. Shared context corrects
call cost, pot odds, live and contestable pots, stack-to-pot ratio, and
bet/raise sizing for current street commitments and stack-capped calls. Provider
errors or excluded decisions are rejected rather than silently replaced.

Live Jev evaluation is deliberately separate from CI because it makes one paid
TypeSafe request per decision:

```sh
EXTERNAL_INFERENCE_ENABLED=true BOT_DECISION_CALL_CAP=100 TYPESAFE_API_KEY=... npm run benchmark:typesafe:live
```

The live command uses seeded, seat-swapped deals and emits the same metrics.
Only statistically supported live comparisons should be used to claim stronger
play; passing unit tests or the mocked benchmark is insufficient.

Unit tests and benchmarks load the optional root `.env.test` before collection.
Existing shell/CI variables take precedence; `.env` is not loaded. `.env.test` is
ignored by Git. Live evaluations require their explicit opt-in flags.

The [explicit heads-up Jev experiment](heads-up/README.md) adds a strict chart
importer, independent sampler control, conditional EV/frequency grading, full-hand
four-hand paired comparisons and isolated memory contrasts. No chart source
passed the audit; chart-dependent calls are deferred. Use
`npm run benchmark:jev:heads-up` for offline mechanics; the dated memory-only live
command has its own 108-call cap and persistent one-run ledger.

- [Focused bot improvement experiment](bot-improvements/README.md): benchmark-only
  canonical-input Jev/LLM candidates and an isolated Rules seed comparison, with a
  separate completed 600-request pilot excluding Eevo. See its
  [dated report](bot-improvements/report-2026-10-15.md); authorization is exhausted.

- [Offline preflop action values](preflop-action-value/README.md): paired premium-hand
  opening actions with current Rules continuations and explicit opponent policies,
  including a larger-equity-budget sensitivity check. No provider calls or
  production strategy changes. See the [completed report](preflop-action-value/report-2026-10-15.md).

- [Focused KK/QQ preflop candidates](preflop-candidate/README.md): isolated call/3-BB
  raise ablations at the production equity budget, with immutable development
  selection and independent, stratified confirmation. Benchmark-only; no paid calls.
  See the [completed report](preflop-candidate/report-2026-10-16.md): medium KK
  raise-to-3-BB passed the conditional-value gate; hard QQ call remains deferred.
  The [promotion review](preflop-candidate/promotion-review-2026-10-16.md)
  records the subsequent narrow medium-KK implementation. QQ remains deferred;
  frozen reanalysis uses the verified baseline bundle described in the guide.

- [Independent bet-size ablations](bet-sizing/README.md): isolated quarter-pot and
  1.5-pot postflop additions for Jev/LLM, real Jev/Eevo compatibility offline,
  and a separately authorized frozen 960-request usage pilot. No production
  menu change or strength claim; paired-match evidence is required for promotion.

The [completed bet-size pilot](bet-sizing/live-report-2026-10-16.md) consumed its
960-request authorization. LLM quarter-pot alone met the frozen usage screen;
playing strength remains unmeasured and production menus are unchanged.
