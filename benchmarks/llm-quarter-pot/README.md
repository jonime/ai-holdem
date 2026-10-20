# LLM quarter-pot: offline river screening v1

This retrospective screen uses exactly 40 saved GPT-5.4-mini observations from
`bet-sizing/live-evidence-2026-10-16.json.gz`: `2-river-0` and `2-river-1`, current
and quarter-pot menus, ten repetitions each. No new calls, Jev/Eevo, six-seat flop,
1.5-pot menu, database, application server or production changes are included.

The [saved-evidence review](review-2026-10-20.md) records **defer** after the
user's completed manual run: `2-river-0` fails with sign reversals; `2-river-1`
passes all 27 combinations. Production and provider spending remain unchanged.
The completed run is preserved in [saved-evidence-v1.tar.gz](saved-evidence-v1.tar.gz);
its checksum and inspection guidance are recorded in the review.

## Manual execution

Run from the repository root with Node 24+ and lockfile dependencies installed:

```sh
npm run benchmark:llm-quarter-pot -- smoke
npm run benchmark:llm-quarter-pot -- full
npm run benchmark:llm-quarter-pot -- analyze
```

**The user runs full manually.** Full enumerates every holding/response through
the engine and may take several minutes. Do not launch or poll it on the user's
behalf. Smoke only evaluates two holdings at one check root as a mechanical check;
it supplies no screening verdict. Full checkpoints each fixture/root action,
prints progress, then saves analysis and a concise verdict report. Analyze reads
saved terminal evidence, reproduces posterior/action arithmetic and the gate,
and verifies completion hashes; it does not replay the engine or call providers.
Return the printed completion summary/artifact paths for saved-evidence review;
there is no reason to rerun full for that review.

All modes use a worker with a new environment containing only NODE_ENV=test and
EXTERNAL_INFERENCE_ENABLED=false, empty Node exec arguments, no environment-file
loading, and blocked fetch/WebSocket/TCP/TLS/UDP/HTTP and server listeners. No
provider or database module is resolved. An optional focused test invocation also
avoids the repository's ordinary `.env.test` loader:

```sh
npx vitest run --config benchmarks/llm-quarter-pot/offline.config.ts
```

Evidence is saved under `benchmarks/results/llm-quarter-pot-v1/` (Git-ignored):

- `2-river-*-<action>.json.gz`: immutable root checkpoints with exact engine
  terminal outcomes for every holding/response, singleton exact showdown shares,
  all 27 scored cells, branch probabilities, full posterior weights/equities,
  fold/call means, safeguards, and the selected branch continuation.
- `completion-v1.json`: manifest hash and every checkpoint's byte hash.
- `analysis-v1.json`: every fixture/assumption comparison, all action rankings,
  worst size/menu losses, sign reversals, ranking patterns, continuation
  sensitivity, and the descriptive equal-weight two-fixture summary.
- `report-v1.md`: concise verdict, gate results and limitations.

No evidence file is overwritten. Identical completed artifacts are accepted.
Full resumes only compatible existing checkpoints; changed sources, configuration,
inputs, manifest links, identities or completion hashes fail visibly. The exclusive
`run.lock` prevents concurrent writers. Graceful interruption completes the current
root and then exits; rerun full to resume. After an unclean process crash, verify no
runner is alive before manually removing the stale `run.lock` and any unfinished
`*.tmp` file. Never remove completed checkpoints to conceal an error. Incompatible
results require a new version/directory, not a modified freeze. Incomplete or
invalid evidence means **defer**, never an abbreviated pass.

## Frozen source reproduction after application changes

The public commands stage `source-bundle-v1.json.gz` into a disposable directory
and execute the original frozen runner there, using the original manifest and
all original sources. The archived engine and the unchanged installed lockfile
supply dependencies. Only the result directory links back to the working tree;
finished checkpoints and analyses retain their original hashes. The temporary
source tree is removed on exit. The wrapper pins the bundle checksum and rejects
changed manifests or dependency lockfiles. It never rewrites an old freeze to
accept new application code. Existing evidence can therefore be analyzed after
unrelated application changes without rerunning the study. Run from a checkout
with this study's dependency lockfile; dependency changes require a separate
installation from the archived lockfile.

## Reconstruction and provenance

The original ledger, plan and freeze are cross-validated: all 960 unique planned
slots, one request each, matching entry/row identities, no failures, complete cells,
fixture/menu input-hash relationships, then the exact 40 relevant observations and
prescribed counts. Selection does not discard checks or unchanged actions.
`observations-v1.json` retains each original ID, repetition, menu, action and hash.

`historical-sources-v1.json.gz` preserves all 360 original frozen source files.
Matching current files were verified byte-for-byte; 35 drifted files were recovered
from Git commit `5bee11d` and verified against the **original** SHA-256 hashes.
Each file's recovery origin is recorded. The old freezes and files are unchanged.
The archive includes reused `@hivetech/poker-engine` 1.0.1 code; its
[MIT license notice](poker-engine-LICENSE) is preserved alongside it.
The isolated historical loader refuses unfrozen application/benchmark imports.
`reconstruction-v1.json.gz` preserves the original engine states, initial states,
complete current-hand history, provider contexts, menu candidates and hashes.
The original 5000-sample context construction was replayed without providers;
base and per-menu hashes match the pilot plan. The new replay independently
checks actor/order, visible cards, stacks, commitments, pot and full transcript
against the historical state, and engine-validates the union of original menu
candidates and every recorded action. Full preserves this provenance via hashes.

Both roots have hero in seat 1 acting **first**, button seat 0, a 12-chip pot,
no river investment and blinds 1/2. `2-river-0` has As Ah and stacks 34/34;
`2-river-1` has 7c 6d and stacks 394/394. The board is 9s 8s 2c 3d Qh.
Starting stacks were respectively 40/40 and 400/400. Preflop raised to 6/called,
then both players checked flop and turn. History has no river check before hero.
The older last-to-act evaluator and its six-representative range contracts remain
unchanged. This evaluator is `first-to-act-river-v1`; terminal evidence is
`first-to-act-terminal-v1`.

`manifest-v1.json` freezes original relationships, new sources, configuration,
reconstruction, observations, and expanded `assumptions-v1.json.gz` **before any
full action values are scored**. The maintainer-only `prepare.mjs` created this
freeze; public commands never rebuild or amend it. A changed study needs a new
version. Historical sources are archived for reproduction, not imported into the
application or substituted into its production behavior.

## Fixed sensitivities and supported tree

Every compatible opponent holding is included: C(45,2)=990 per fixture. Independent
synthetic post-line weights are broad=1, value-heavy=2^categoryIndex, polarized=12
for straight-or-better, 6 for high card, 1 otherwise. Ordered categories run from
high card=0 through straight flush=8. These weights are assumptions, not session
statistics or estimates of the pilot opponent.

Three versioned response profiles (`call-heavy`, `selective-value`,
`bluff-pressure`) have holding-dependent probabilities at every supported size.
`configuration.profiles` in `assumptions.ts` gives the fixed numeric tables:
rows distinguish high card, pair/two pair, trips-or-better. It specifies check-back
mass, the remaining half/full/all-in bet mixture, fold/call/raise mass after a hero
bet, and the minimum/pot/all-in raise mixture. Facing more than half pot reduces
weak/middle call mass by 40%, transferring that mass to fold. Expanded tables
freeze each holding/root/profile's actual legal amounts and probabilities,
including zero probabilities and exact safeguard overrides. They were frozen
without examining action values and are never fitted to favor a candidate.

After hero checks, opponent checks back or bets half pot, full pot, or all-in.
After hero bets, opponent folds, calls, or raises minimum, pot, or all-in. Pot raise
means call, then raise by the pot after calling. Sizes round to the nearest chip
and clamp to engine bounds; aliases merge their probability mass. Root candidates
are the deduplicated union of the two *original* menus (check and all legal bet
amounts); none are replaced or silently clamped. After an opponent bet/raise,
hero may only fold/call. All branches end through the engine, including non-all-in
raises, effective-stack refunds and ties; terminal stacks must conserve chips.
Unsupported or invalid inputs fail visibly with no fallback ranges/actions.

Opponent probabilities use only its own cards and public betting state; its exact
share bounds enumerate every unseen hero holding without conditioning on hero's
actual cards. Forced splits check/call. Guaranteed nonnegative calls override
folding; impossible calls override calling. The same global visible-card exact
bounds guard hero's fold/call continuation policies. Odds use contestable pots
with unmatched-bet refunds. No actual opponent holding enters hero's continuation
choice. Every response reweights the **entire** prior by its holding-dependent
likelihood; each posterior is normalized before equity and fold/call means are
computed. Zero-mass branches have empty posteriors/null conditional values.

The 3 ranges × 3 profiles cross three consistent hero continuation policies: fold,
call (both guarded), and the higher posterior-mean fold/call EV, choosing call on
an exact tie. The last is an **optimistic range-informed reference, not an observed
LLM response**. Identical continuation policy applies across compared roots.

EV is terminal hero stack minus stack before the root action, divided by BB=2.
The existing range calculator supplies exact singleton shares; weighted sums give
exact branch posterior equities without changing its contract or reporting
sampling confidence intervals. Engine terminal payouts remain authoritative.
Exact call arithmetic is independently checked against contestable contributions,
showdown share and unmatched refunds.

## Comparisons and gate

For every fixture and all 27 combinations, report:

1. **Size:** EV(bet 3) minus EV(bet 4).
2. **Recorded menu:** mean EV of all ten quarter-pot actions minus mean EV of all
   ten current actions, including every check and unchanged decision.

For these particular saved counts, the latter happens to equal 0.3 × the former
for each fixture. This is an aggregate identity, not evidence of causal individual
replacements or stable stochastic action frequencies. Each fixture is judged
separately. The equal-weight two-fixture mean is descriptive and cannot rescue a
failed fixture.

Shortlist for a later paid-study **plan** only if both differences are nonnegative
in all 27 combinations for both fixtures, with a strictly positive recorded-menu
difference in at least one combination per fixture. Tolerance is 1e-9 BB. Any sign
reversal, failed fixture or reconstruction failure means defer. No widening,
retuning or added observations is allowed after results. Passing authorizes no
spending/promotion. Failure does not prove universal quarter-pot inferiority.
This is selected-situation retrospective screening, not independent confirmation
or measured playing strength. Ten repetitions do not establish stable LLM action
frequencies.
