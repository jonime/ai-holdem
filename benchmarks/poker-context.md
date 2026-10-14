# Shared context, heads-up guidance and session observations

Production policies use `typesafe-poker-v4.0` and
`llm-poker-v4.0-guided-{balanced|tight|aggressive}`; model configuration is unchanged. The analysis and advisory
library are independently versioned as `poker-facts-v1` and `poker-advice-v2`.
There is one provider request per decision. Equity Rules' strategy code is
unchanged; production retains its legacy fractional sizing.

## Context and privacy

Apply `20261013000000_add_bot_hand_context.sql` before the application release.
The original RPC is service-role-only, reads one game/hand and its ordered
pre-action states in one SQL statement, and needs no backfill. It never joins
actors to mutable names. Repository parsing validates the envelope and states;
empty legacy states or gaps give an explicit unknown classification. Database
errors remain visible. A version or complete replay mismatch returns the usual
conflict before inference. Replay validates successive engine states, resolves
each actor from the authoritative turn and immutable initial configuration,
and sends only seats, actions, payments, commitments, pot sizes and street
participant lists. Private states, decks, tokens and opponent cards never enter
provider requests. Full projected factual history accompanies summaries.

Positions come from dealt participants, including folded players; empty and
sitting-out seats are excluded. Four-handed first position is cutoff and
five-handed first position is hijack. Heads-up button also posts the small blind,
acts first preflop and last postflop. Street orders and pending actors are
explicit. Preflop classification counts calls and aggression, ignoring folds;
short all-in raises remain aggression even when they do not reopen betting.

The live pot includes all commitments. Contestable pot after a stack-capped
call excludes chips above HERO's contribution cap and single-contributor layers.
Effective stacks are remaining stacks capped against each non-folded opponent;
the headline uses the largest opponent cap, and SPR divides it by the live pot.
These quantities are separate, especially around side pots. Raise sizes are
street totals; payment is total minus HERO's existing street commitment. Calls
are included in that payment once. Both providers share opening raises to
2/2.5/3 BB in known unopened pots, fractional-pot sizes elsewhere, engine clamps,
deduplication and an explicit maximum commitment.

Card facts use the installed engine evaluator behind the adapter and independent
rank-window/suit analysis, not Equity Rules' approximate draw helpers. The
best-five rank and tiebreak vector identify made ranks/kickers and board-only
strength. One-card straight completions include wheels; flop backdoors require
two cards, and river draws are suppressed. Blockers are visible card-removal
facts, never known opponent ranges. Individual bet/raise pressure events use
increment above the call divided by pot after calling; calls are not pressure.
Street totals are descriptive sums, not equity or calibrated strategy scores.

Advice is original qualitative text selected by street, position, hand
properties, pot type, action lines, pressure and opponent count. Heads-up
patterns require known history, two current participants and two participants
through the relevant street. Six-seat preflop remains six-seat even after folds.
Multiway advice accounts for multiple continuing ranges and limited fold equity.
Unknown situations get general advice. Advice never removes candidates and
cannot override the existing exact river safeguards or playstyle boundaries.
The supplied context and advice IDs/text are used only during inference; debug
inspection storage has been removed. Public DTO privacy restrictions still apply.

## Offline evidence

```sh
npm run check
BOT_SCENARIO_LIVE=false npm run test:bots
npm run benchmark:policy
npm run benchmark:poker-context
npm run test:sql:bot-context
NEXT_DIST_DIR=.next-context-check npm run build
```

The new default benchmark explicitly disables live runs even when `.env.test`
contains live flags. It exercises production Jev and LLM wrappers with local
mock responses over all 169 hand classes. Pairs/suited/offsuit classes have
6/4/12 weights (1,326 combinations). Eleven nodes cover six-seat openings from
every non-BB position, button/BB facing UTG raises, heads-up opens/defends,
limped and re-raised pots. Two decisions per cell measure exact move agreement.
Reports contain weighted action/sizing frequencies by node (including positional
differences), failure counts, mean/p95 latency, policy versions, available usage
and cost, and individual rows. Offline matrix contexts use five equity samples
for speed; they verify wiring and legal arithmetic, not strategy or equity
accuracy. Full-hand comparisons use 100 equity samples, paired seeded deals,
seat-swapped heads-up and all six subject-seat rotations.

`benchmarks/results/poker-context-offline.json` contains the generated legacy
matrix/control report. Results are ignored by Git. The v2.1 context baselines are
retained as historical controls. Both Jev and LLM now have guidance ablations.
`heads-up-offline.json` records fixed-pilot wiring across all eight variants.
The unit suite additionally exercises all 169 classes at 10/25/100 BB with unequal
stacks, sparse samples, identity changes, history gaps, per-street opportunities,
forced departures, hidden-card invariance and server claim/version ordering.
All LLM playstyles run through the fixed cases offline, including exact river checks.
Three-to-two-player and larger-table controls preserve original dealt context;
`seatCount` does not determine whether the current hand is heads-up.

Offline provider outputs are scripted. Legal actions, agreement, frequencies and
intervals here **do not establish playing strength**. There are no GTO pass
thresholds, copied reference ranges or blanket classifications of legal folds as
mistakes. Random-hand equity remains distinct from betting-range equity.

## Session statistics

Deploy `20261028000000_add_bot_session_context.sql` before application code.
The stable, service-role-only RPC returns current-hand history and the latest 50
completed earlier hands, selecting hands before fetching their actions and binding
the entire read to one game version. No backfill or historical mutation occurs.
Equity Rules continues using the original hand RPC and legacy context.

Replay every historical hand through the adapter against its final engine state.
Missing/legacy records make coverage incomplete; malformed records/DB failures
remain visible. Only server-produced `poker-session-stats-v1` aggregates enter
provider requests. Current participants are attributed through immutable engine
identity plus human ownership token or full bot configuration (descriptor,
difficulty and playstyle). Names/seats do not establish continuity. Gaps, missing
participants and changes stop older attribution, even if an old occupant returns.
No historical cards, holdings, outcomes, ownership tokens or raw states are sent.

Counts and opportunity denominators are separate for hands dealt heads-up and
with at least three participants. VPIP/PFR have one denominator per participant-hand
with a preflop decision; button raise/limp/fold use the opening decision. BB fold,
call and raise observations use the first response to a button open, separating
opens up to 3 BB from larger ones. A street aggression opportunity requires a
legal bet or raise; a faced-bet fold opportunity requires an outstanding price and
legal call. Record these separately for flop, turn and river. Zero opportunities
have null rates and unknown evidence; fewer than ten are insufficient for
opponent-specific adaptation. Ten is a conservative product default, not a
statistical guarantee. Larger samples are still uncertain evidence of tendencies
and table image, never an obligation to reverse previous folds.

Conservatively exclude a participant-hand with identifiable departure provenance.
The RPC resolves its actor from the authoritative pre-action engine turn, then
checks leaving flags in before/after configurations. Unmarked folds remain recorded
folds, not inferred intent: timer and some credit-departure provenance is unavailable.

Shared advice is original qualitative guidance for button opening/limping, BB price
sensitivity, re-raised pots, shallow stacks, modest-hand value, semi-bluffs and
bluff-catching. It never supplies forced frequencies, explicit ranges, solver
restrictions or fine-tuning. Jev replaces its variance preference with expected
chip value. LLM playstyles remain preferences subordinate to exact safeguards.
Facts, advice, session aggregates and provider policies are independently versioned.
Frozen current policies in `baselines/jev-v3.ts`, `questions-v3.ts`, `decision-v3.ts`,
`llm-v3.ts` and `strategy-advice-v1.ts` preserve the pre-change prompts/output
contracts; benchmark boundaries omit new session/count fields for current baselines.
Engine legality/exact river safeguards remain shared across all variants.

See the [2026-10-14 pilot evidence and recommendation](heads-up-pilot-2026-10-14.md)
for measured behavior, latency, cost and excluded match blocks.

## Explicit capped OpenRouter pilot

The live entry point extends this benchmark and requires existing credentials in
`.env.test`, both inference opt-ins and a shared 640–1,000-request cap:

```sh
EXTERNAL_INFERENCE_ENABLED=true BOT_DECISION_CALL_CAP=1000 \
  npm run benchmark:poker-context:live
```

The exact 40 fixed cases are repeated twice across eight variants (640 requests):

| Family | Variant | Reasoning |
| --- | --- | --- |
| Jev | current / guidance / guidance + history | provider-owned |
| `openai/gpt-5-nano` | current / guidance / guidance + history | minimal |
| `openai/gpt-5-nano` | guidance + history | low |
| `openai/gpt-5.4-mini` | guidance + history | low |

Balanced is the primary LLM playstyle. The fixed cases include 24 openings/BB
responses (four holdings at 10/25/100 BB), eight limp/large-open/re-raise/unequal-stack
cases, and eight postflop pressure/exact-river cases. Guidance + history uses the
same fixed, adapter-replayed 20-hand synthetic observation window for each case,
with paired alternating-button lines restoring stacks. This tests a controlled
history ablation; it is not a claim of natural opponent adaptation or persistent
memory strength. All decision variants see identical cards, prices and lines.

The gateway is the configured OpenRouter endpoint. Requests disable fallback and
require supported parameters. The returned model ID must match the requested ID
(or its dated snapshot); unavailable models fail visibly with no substitution.
Compatibility decisions count toward the same cap. Failed attempts count too;
there are no automatic retries. Production `LLM_BOT_MODELS` is never changed.

The remaining budget starts only complete paired blocks: all eight variants in
both seats with the same seeded deal, against Equity Rules and fixed minimum-size
aggressive/passive opponents. Reserve 96 calls before each block; each hand is
bounded to 12 actions and six subject decisions. Failures or truncation invalidate
the entire block for chip comparisons. Such a small sample is exploratory.
Comparative estimates use complete seed/opponent blocks as units, not correlated
individual hands. Fewer than two blocks yield no uncertainty interval; normal
approximation intervals at this size are descriptive, not strength gates.

The live command exits nonzero on provider/invariant failures, retaining the report.
Reports are saved after progress and in `finally` to
`benchmarks/results/poker-context-live.json`, including sanitized partial results.
Useful completed runs can be preserved as dated sanitized snapshots in
[`benchmarks/evidence/`](evidence/README.md), together with their interpretation,
model/context versions, budget and checksum. Routine generated reports remain ignored.
They contain action counts by opportunity (with denominators), exact invariant
failures, missed guaranteed value, provably unproductive river aggression, successful
request median/p95 latency, token counts and reported actual cost. Strategic missed
value/over-aggression for ordinary legal decisions is **ungraded**: a legal fold
is not automatically an error. Jev may omit usage/cost, and failed requests may
lack billing details; totals explicitly show known-request coverage and must not
be presented as complete billing. Repeat agreement and case-paired comparisons
must retain sample sizes; case mixtures do not estimate population poker frequency.

[Official mini documentation](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
confirms low reasoning and structured outputs; its listed input/output prices are
$0.75/$4.50 per million tokens, versus $0.05/$0.40 for
[nano](https://developers.openai.com/api/docs/models/gpt-5-nano).
These are documentation prices, not a substitute for gateway-reported actual cost.
Use the exact [OpenRouter nano](https://openrouter.ai/openai/gpt-5-nano) and
[mini](https://openrouter.ai/openai/gpt-5.4-mini) IDs and verify their live responses.

Existing `test:bots` and `benchmark:typesafe:live` keep their explicit opt-ins/caps.
The SQL runner uses rolled-back local fixtures, checks ordering, completed-hand
bounds, permissions, actor-specific forced departures and game/hand isolation. It
never loads application `.env`, resets a database or calls providers. CI runs it
with the other integration suites after all migrations.

## Research attribution

[PokerSkill](https://arxiv.org/html/2605.30094v1) motivated deterministic analysis
plus selective guidance. Its reported benchmark is heads-up and reports losses
against GTOWizard; it does not establish six-seat strength. We adapt the approach
without importing its implementation, tables, numerical attack/defense budgets,
or non-commercial code. See its [repository license](https://github.com/lbn187/PokerSkill#license).
[jev-preflop-poker](https://github.com/marcbara/jev-preflop-poker) motivated
weighted starting-hand chart reporting; no reference ranges are copied.

[Readable Minds](https://arxiv.org/html/2604.04157v1) motivates observed-history
context as an experiment. [Poker Arena](https://arxiv.org/html/2606.13815v1) reports
model-dependent memory benefits and regressions; memory is not assumed to improve
play. [PokerBench](https://arxiv.org/html/2501.08328v2) informs scenario evaluation;
no dataset or trained policy is reused. [ToolPoker](https://arxiv.org/html/2602.00528v1)
uses solver-assisted reasoning and [SpinGPT](https://arxiv.org/html/2509.22387v2)
uses specialized training. Their results do not establish that this application's
qualitative prompts or model changes achieve comparable strength. We use none of
these papers' restricted assets, detailed ranges, budget systems or training data.

The subsequent [explicit heads-up Jev experiment](heads-up/README.md) preserves
this pilot evidence and adds exact reference import/conditional scoring, full-hand
paired comparisons and controlled memory contrasts. It does not expand the model
comparison or alter production bots.

The independent [confidence-aware opponent-advice experiment](opponent-advice/README.md)
uses these existing aggregates without changing production prompts or settings.
Its capped 960-request pilot requires fresh paid authorization.

The [authorized Plan 3 evidence](opponent-advice/live-report-2026-10-14.md)
is incomplete (721 network failures, 239 successful decisions) and has a v1
omission-control limitation. Corrected v2 controls are offline-only; no production
promotion or additional paid run is authorized.

The subsequently authorized [complete corrected v2 pilot](opponent-advice/live-v2-report-2026-10-14.md)
completed 960 additional calls without failures. Jev responds to heads-up fold
advice but chooses concerning extreme sizes; neither challenger is promoted.
