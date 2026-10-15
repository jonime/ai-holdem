# Production predictability and representation audit

The saved freeze describes the completed run before integration with newer `main`
changes. Integration retained dependency and bot-information updates through
`0983160`; `package.json`, `package-lock.json` and the twelve game dictionary
modules therefore differ from their recorded hashes. The original
freeze, input plan and evidence remain unchanged. Live execution intentionally
rejects this drift; reproducing the paid run requires its recorded source and
fresh authorization. Offline analysis of the saved evidence remains available.

This evaluation inspects current registry-selected confidence-aware Jev and Eevo,
`openai/gpt-5.4-mini` with low reasoning and balanced playstyle, and production
Equity Rules. It uses fixed synthetic decisions. It changes no production policy,
prompt, settings, database, provider timeout or application interface.

Read [the integrated report](report.md) before interpreting the evidence.

## Reproduce without charges

Node 24+, lockfile dependencies (`npm ci`), no Supabase or provider credentials:

```sh
npm run benchmark:bot-audit
npm run benchmark:bot-audit:analyze
npm run check
BOT_SCENARIO_LIVE=false EXTERNAL_INFERENCE_ENABLED=false npm run test:bots
npm run benchmark:poker-context
```

The offline command explicitly disables external inference and blocks `fetch`.
Its rules partitions run in isolated Node workers without credentials or environment
file loading; each partition retains the full production sampling budget.
It uses the actual rules policy, legacy history and sizing preparation, 5,000
random-opponent equity samples, every one of the existing 11 preflop nodes,
169 classes, all three difficulties and three identical repetitions. These repeats
check reproducibility; they are not independent samples. Rules also runs all 60
representation cells at each difficulty in native and controlled preprocessing
modes. The gzip evidence contains sanitized observations; `offline-summary.json`
is derived and ignored. Latencies depend on the host. Analysis loads no environment
files, provider modules or credentials and makes no inference requests:

```sh
npm run benchmark:bot-audit:analyze -- benchmarks/bot-audit/offline-evidence.json.gz /tmp/audit-summary.json
npm run benchmark:bot-audit:analyze -- benchmarks/bot-audit/live-evidence-2026-10-15.json.gz /tmp/live-audit-summary.json
```

A reserved ledger slot without a completed observation represents an interrupted
attempt. Analysis reports it separately, includes missing observations in reliability
coverage, and excludes incomplete pairs from representation contrasts.

## Fixture design and mechanical boundaries

Paid starting-hand cells use exactly the requested 24 classes at HU button opening
and BB facing a 3 BB raise, 100 BB deep: 48 cells × three repeats = 144 decisions
per provider. Combo weights are 6 for pairs, 4 for suited and 12 for offsuit.
Paid summaries are conditional on this selected subset; they are not complete
opening ranges. They contain no invented reference frequencies. Each class uses one
fixed physical holding. Combination weighting is a representative-class diagnostic,
not an enumeration of all 1,326 holdings; suit/hash sensitivity can limit that
interpretation even for the complete 169-class Rules matrix.

Representation fixtures contain six HU nodes (two preflop, two flop, turn, river)
and six multiway nodes (three/six-player preflop and flop, four-player turn,
five-player river). Cards cover suitedness, offsuit broadways, genuine straight
and flush draws, paired-board kickers, board-only quads and a royal-board split.
The HU turn caps a nominal 50 BB bet at HERO's remaining 4 BB. The HU river
retains the production exact forced-split candidate protection. Recorded synthetic
histories exercise absent, insufficient and Wilson-qualified opponent evidence.
Statistics are projected with the production history validator, then remapped by
seat; historical holdings never enter provider input.

The five representations are original, global suit cycle `c→d→h→s→c`, reversed
hero deal order, cyclic seat rotation by one, and chips/blinds ×10. All transforms
are invertible. The canonical 60/120 blind unit makes every production menu
fraction scale exactly. Arbitrary scale factors, fractional chip amounts, collisions
and replay actor mismatches fail closed. Existing preflop fixtures are reused.
The benchmark's replay adapter isolates the installed engine's waiting-table
metadata: the public adapter has no button initialization option, so it validates
the adapter-created waiting state, sets only previous button/hand number, restores
it through the adapter, and starts/replays every real action through the adapter.
It never patches an active hand. Production adapter code is unchanged.

Before inference, compare inverse-normalized legal bounds, prices, action history,
position, facts, statistics, confidence advice and exact action/size menus.
Chip values become BB units, references return to canonical seats and suits, and
unordered participant lists are sorted. Tied best-five physical card representatives
are compared by rank, alongside the full evaluator rank/kicker facts. Hole order
is semantically unordered. Raw provider prompts are not rewritten by this projection.
A discrepancy in any normalized mechanical component blocks the live runner;
native preprocessing differences are recorded separately for inspection.

The controlled input replaces only `analysis.showdownEquity` with the original
5,000-sample value. Tests verify all other analysis fields remain native. Each
representation's independent native MC value and normalized preprocessing differences
are retained. Rules additionally runs native and controlled decisions: its existing
card/history hash remains representation-sensitive even with frozen equity. Neither
MC differences nor deterministic hash changes are attributed to paid-provider
reasoning. Production wrappers recompute their own facts, advice and candidates.

## Frozen paid pilot — completed; authorization exhausted

The user-authorized 972-request pilot completed on 2026-10-15: 957 accepted
decisions and fifteen Eevo failures. Its authorization is exhausted. See the
[paid report](live-report-2026-10-15.md) and preserved compressed evidence.
The commands below document that run; they do not authorize another one. Do not
reuse its token or remove the ledger to rerun it. Further paid execution requires
a new explicit authorization and an independently reviewed plan.

Implementation or offline evaluation does **not** authorize charges. Ask the user
for fresh explicit authorization for this frozen pilot before supplying its token
or invoking the live command. Earlier opponent-advice authorizations are exhausted.
Never infer authorization from a shell variable left by another experiment.

The prescribed run is 972 decisions: Jev, Eevo and mini each receive 144 preflop
plus 180 representation requests. No compatibility probes are currently needed or
scheduled (zero of the allowed one per provider). The prescribed maximum remains
975 including any separately implemented and authorized compatibility probes; the
hard shared cap cannot exceed 1,000. No unused allocation funds extra observations.

After authorization, configure all three real server credentials locally,
`LLM_API_ENDPOINT=https://openrouter.ai/api/v1/chat/completions`, and run:

```sh
EXTERNAL_INFERENCE_ENABLED=true BOT_DECISION_CALL_CAP=972 \
BOT_AUDIT_AUTHORIZATION=authorize-new-972-decision-audit \
npm run benchmark:bot-audit:live
```

Do not paste credentials into commands or reports. The command loads the existing
optional `.env.test` under the repository's usual precedence; `.env` is not loaded.
Credential presence and endpoint checks occur before fixture preparation or budget
reservation. The runner verifies `freeze.json`, current registry wrapper classes,
all mechanics, the entire plan and input hashes before creating the ledger.
`freeze.json` pins local production policy dependencies, the installed poker engine,
lockfile, fixture helpers and audit runner. The offline run also produces
`pilot-plan.json` with the exact 972-slot order and controlled-input hashes. The
freeze records its digest; live execution must reproduce both source and input
hashes before reserving a slot. To deliberately update a freeze, create
a new evidence version and preserve earlier freezes/evidence; never rewrite a paid
run's manifest. A hash freeze cannot pin a remote service's model weights.
Returned model/version IDs are recorded only when safely available; missing metadata
is unknown. The LLM request disables gateway fallback and requires its parameters.

Provider order rotates; fixture order shifts between repetitions; representation
order rotates and reverses. The manifest records the full order. Before each decision
an exclusive persistent ledger reserves its budget; the transport permits exactly
one request for that slot. Failed requests consume allocation. Incremental ledger
and report writes use atomic rename. Existing ledgers, including interrupted runs,
are refused; there is no automatic continuation or replay. Calls retain the
production 60-second header/body deadline and error behavior. Errors are recorded
as failures, without retries, model substitution or fallback poker actions.

Only synthetic IDs, allowlisted decisions in BB units, bounded probability diagnostics,
policy/model metadata, finite token/cost fields, fixed failure categories and latency
are saved. Action `amountBB` denotes the engine bet/raise-to commitment or
incremental call price; check/fold amounts are null. Probability vectors retain
allowlisted native move labels as diagnostics, not action-frequency estimates.
No raw responses, reasoning, credentials, ownership tokens, historical
holdings or production game data are retained. Usage and cost absence are shown as
missing coverage, not zero cost. Keep paid ledgers and their manifests as evidence;
never delete one to make a paid command run again.

## Interpretation and attribution

The report separates mechanical correctness, representation sensitivity,
starting-hand concentration and operational reliability. Total variation is a
descriptive distance between empirical action-and-size distributions, reported
with same-input agreement, individual sample counts and excluded incomplete pairs.
Three repetitions cannot establish significance or stable mixing frequencies.
Provider probability vectors are diagnostics and remain separate from empirical
frequencies. Determinism alone is not a defect. No full matches, adaptive opponents,
EV estimates, exploitability estimates or GTO-frequency comparisons occur here.

GTO Wizard's [Principles of GTO](https://blog.gtowizard.com/principles-of-gto/)
and [The Three Laws of Indifference](https://blog.gtowizard.com/the-three-laws-of-indifference/)
inform the distinction between EV mistakes and frequency mistakes: a concentration
measurement is not an EV measurement. This is conceptual attribution to explanatory
articles, not reused code, solver ranges or numerical targets. This audit cannot label a concentrated strategy exploitable without independent
strategic evidence. Production fixes,
richer bet menus, adaptive matches and strategic mixing require separate work.
