# River sizing candidate v1: manual conditional-policy study

Status: **completed with defer for easy, medium and hard**. All three failed the
development positive-mean gate against the polarized/current-Rules cell. No
difficulty qualified for confirmation; zero confirmation situations ran.
See the [saved-evidence review](review-2026-10-19.md) for verified results and limits.
Production `OpeningAwareEquityRulesBot`, its medium KK opening, Jev, Eevo, LLMs,
contexts and persistence remain unchanged.
The [original river study](../river-lookahead/README.md), its frozen sources and evidence
remain untouched. Its posterior-optimal response to an all-in raise is discovery
context only; this new study uses actual Rules continuations to engine completion.

Run from the repository root with Node 24+, installed lockfile dependencies, and
no database, app server, environment files or provider credentials:

```sh
npm run benchmark:river-candidate -- smoke
npm run benchmark:river-candidate -- development
npm run benchmark:river-candidate -- confirmation
npm run benchmark:river-candidate -- analyze
```

The user owns both long stages. The implementing assistant must not launch them
or poll their progress. Smoke is a small 5,000-sample mechanical and nine-pair
exercise, with no study checkpoints or study decisions retained. Each long stage
prints checkpoint progress and a concise completion summary, elapsed seconds and
next command. Return the summary or artifact path for review. Development is 48
situations × three difficulties; confirmation is 120 fresh situations per qualifying
difficulty. Each situation has 3 ranges × 16 draws × 3 policies × 2 paired arms.
Expect substantial CPU time; no paid calls occur. Two isolated workers have an
explicit credential-free environment and empty `execArgv`; they block fetch,
HTTP(S), TCP, TLS and UDP. They use the existing TypeScript module hook, bypassing
Vitest and its `.env.test` loader. No application `.env*` files are loaded.

## One frozen candidate and bounded support

`RiverCandidateBot` wraps the current `OpeningAwareEquityRulesBot`; `override`
returns the exact baseline object unless every condition passes:

- Complete heads-up history from a hand dealt to two players, one active opponent,
  hero in position with nobody still to act, facing no bet after the opponent's
  river check; zero street investment.
- Five distinct board ranks, at most two cards of any suit, hero's exact best
  category straight, exact visible bounds `minimum >= .5` and `maximum > .5`.
  Thus hero cannot lose and some compatible holdings lose to hero. Bounds use
  every unseen holding, independent of the sampled opponent deal.
- Baseline `rules-value-bet` at the existing legacy half-pot option. The existing
  two-thirds option must exist, be strictly larger, engine-legal, and strictly
  below the effective all-in amount. Sizes use the existing rounded and deduplicated
  menu, never fixed chip amounts. The engine validates every applied action.
- The exact support below passes. This deliberately applies the later production
  support restriction already in the benchmark so the tested and promotable
  override are identical.

**Frozen public-line/stack support:** blinds 1/2 chips; button (hero) raises to an
integer 4–14 chips preflop and big blind calls. Flop and turn are either BB check,
hero bet 3–21 integer chips, BB call then check/check; or check/check then BB check,
hero bet 3–21, BB call. BB checks river. No other actions occur. Either physical
seat can be button/hero; orientation 1 uses a disposable real engine fold to rotate
the button before the planned deal, with the blind transfer compensated in the
starting stacks. The resulting hand numbers are 1 and 2 respectively. Root live
and legacy pots must both equal `2*(preflop raise + postflop bet)`, within 14–70
chips. Remaining effective stacks must equal exactly 1, 1.5 or 3 times that pot;
stacks are integer chips and differ by at most 12 chips. Intermediate SPRs and
other blinds, bet lines, pot bounds or stack asymmetries are unsupported. These
are conditional support points, not an interpolated interval. The complete
matched call transcript, equal prior commitments and zero river commitments
exclude side pots and unsupported contribution states. Any future production
promotion must retain these exact bounds and predicates.

Both arms use **unchanged production Rules** after the root, including actual
fold/call/re-raise choices after minimum, intermediate and all-in raises. Contexts
use `projectBotHistory`, legacy decision-history projection, `correctedContext:false`
and `createLegacySizingOptions`, as production Rules does. All contexts use the
normal default 5,000-sample equity budget, including scripted opponents' contexts.
No hidden holdings, burns or deck order enter another actor's context. Root decisions
are reused across hidden holdings because the visible input is identical. Every
continuation must reach engine `complete` within 100 actions (root included).
Engine final stacks minus hero's stack immediately before the root, divided by
2-chip BB, determine returns; sunk contributions, returned chips and ties are
accounted for by terminal engine payouts. Chip conservation is checked after every
action. Failure anywhere invalidates the entire situation/difficulty block, retains
partial traces and prevents that difficulty's promotion; failed blocks are never
silently retried or excluded to obtain a passing gate.

## Frozen allocation and generation

`config.ts` freezes 12 equally weighted strata: 2 lines × 3 exact root SPRs × 2
physical orientations. Development has four independent situations per stratum;
confirmation has ten. Distinct generator seed namespaces are recorded in
`freeze-v1.json`, along with every expanded fixture, allocation, source hash,
acceptance rule, control and sampling formula. Namespace/configuration changes
require a new version. Generation happens before any baseline or candidate results.

Seeded generation chooses a straight high rank 7–A, hero's top two straight ranks,
three consecutive lower board ranks and two other distinct ranks outside that
straight's rank interval; card suits are drawn independently, then board order is
shuffled. Rejection uses only distinct-card checks, maximum two board cards per
suit, exact unbeatable visible bounds, and global suit-class uniqueness. It never
uses baseline action, activation, return or a provider. Each fixture stores counts
of construction rejections by reason. All 24 suit permutations are canonicalized,
with hole order and board order ignored for uniqueness. Development/confirmation
are globally disjoint; the discovery fixture (`9h 8h` / `Jh Tc 7c 2h 6d`) and every
suit-equivalent version are excluded. This exclusion includes flop-order variants.

Replicate zero in **every stratum and phase** is preallocated as a rainbow/two-tone
board Broadway with low hero cards: an unbeatable straight, forced board split,
and hence baseline-inactive zero treatment effect. This gives 12/48 and 12/120
planned inactive situations. Other accidentally inactive baselines also remain;
there is no activation-based resampling. Canonical uniqueness rejection also
applies to these preallocated split situations. Seed independence and suit-class
exclusion do not imply representativeness of natural poker hands.

## Synthetic ranges and opponent controls

These are **synthetic post-line assumptions**, not empirical or solved ranges.
Enumerate all 990 holdings compatible with hero's two cards and the five board
cards. Category index is high-card=0, pair=1, two-pair=2, trips=3, straight=4,
flush=5, full-house=6, quads=7, straight-flush=8, evaluated from the opponent's own
holding and board. Broad weight is 1; value-heavy weight is `2^index`; polarized
weight is 12 for index≥4, 6 for index=0 and 1 otherwise. Normalize over all holdings.
Draw 16 holdings independently **with replacement** per range with frozen weighted
inverse-CDF sampling. Duplicates remain in the 16-draw mean. Reuse each draw across
arms, all difficulties and all policies. Range sampling does not inspect root
choices or candidate outcomes.

The three policies are current production Rules at the tested difficulty and:

- **Call-heavy:** check when free. Facing a bet, call with probability .95 when
  actual call/live pot ≤.4; .80 when ≤.7; .55 above .7; otherwise fold. Never raise.
- **Selective raising:** check when free. Unless the visible board forces every
  compatible holding to split, raise with probability .45 for own two-pair or
  better, .20 otherwise, if a raise is legal. Conditional sizes are legal minimum
  with probability .40, `floor((minimum+maximum)/2)` with .35, and legal maximum
  (all-in) with .25. Collapsed size choices retain their probability mass. On the
  remaining branch (or with no legal raise), call probabilities are .85/.55/.20
  at the same ≤.4/≤.7/>.7 actual-call/live-pot bands, folding the residual.

Both controls use exact own visible bounds to **never fold a guaranteed profitable
call** (`minimumShare >= actualCall/contestablePotAfterCall`). A forced split
checks/calls and never raises. On other guaranteed calls, the raising control may
raise but cannot fold. Scripted decisions see only their own cards and public
information; no hero-private-card oracle, true holding range or sampled rollout
outcome informs them. Seeded uniforms are reset per arm and difficulty for each
situation/range/draw/policy. Common random numbers couple the policies, even when
arm action paths diverge; they do not make response frequencies identical.

## Gates, inference, and evidence

The independent unit is the **situation**, never a holding, suit permutation,
difficulty comparison or policy cell. First average the 16 paired draw differences
for each situation and cell. Then average equally within each stratum and across
the 12 strata. Bootstrap 20,000 seeded resamples: independently sample whole
situations with replacement within each stratum, preserving its planned size.
Use the same draw schedule for every cell/difficulty; no cross-cell independence
is assumed. Two-sided percentile intervals have **approximate coverage**.

For each difficulty separately:

1. Development: all 48 situations, zero failed blocks, passing mechanical checks,
   positive mean difference in all nine range/policy cells, and activation in every
   stratum. Development's descriptive intervals use .95 confidence; lower bounds
   are not its selection rule.
2. Confirmation: only development-qualified difficulties are evaluated; all 120
   planned situations, zero failed blocks, passing mechanics and strictly positive
   lower bounds in all nine cells. Confidence is always `1 - .05/27`
   (approximately 99.8148%), retaining all 27 planned comparisons even if fewer
   difficulties qualify. The lower quantile uses `(1-confidence)/2`.
3. No alternative candidate, extra sample, selective exclusion, narrower predicate
   or changed policy can rescue failure. A new idea requires a new version.

Each immutable compressed checkpoint contains the full fixture, difficulty,
activation, roots, every paired holding and action trace, terminal stacks/returns,
and any failure. Manifest hash plus row digest binds it to sources and allocation.
A coordinator lock prevents concurrent writers and permits dead-process recovery
on the same host; exclusive atomic linking publishes complete checkpoints. Resume
validates existing checkpoints, replays their saved actions/payouts, and never
reruns recorded failures. Interruptions before checkpoint publication may recompute
the unfinished deterministic block. A worker crash is retained as a failed block.

The two completed phase archives, mechanical evidence, analysis and report are
exclusive-create and cannot overwrite different evidence. Checkpoints live under
`benchmarks/results/river-candidate-v1/` (Git-ignored); archive files live in this
versioned directory. **Keep both archives and checkpoints** for reanalysis. Source
verification occurs before/after stages and after blocks. The manifest covers
application and benchmark TS/JS sources, engine code, runtime hook and lockfile;
`baseline-source-v1.json.gz` preserves recoverable source text bound to the manifest.
The preparation-only `node benchmarks/river-candidate/run.mjs freeze` creates this
freeze once; it refuses replacement. Changing frozen sources requires a new study
version, not editing a manifest or deleting failed evidence.

`analyze` verifies source manifests, stage prerequisites, deterministic paired
holdings, archive/checkpoint equality, every legal action and terminal payout
without running a bot or repeating simulations. It writes full analysis JSON,
including activation rates, nine BB differences/intervals, individual draw loss
counts/worst losses, losing situations, response frequencies and stratum results;
failures are explicit exclusions that block eligibility. Generator exclusions are
in the frozen fixtures. The summary names eligible difficulties or `defer` and
points to artifacts. Running analysis again must reproduce exactly the archived
analysis. These remain conditional-policy values under synthetic assumptions,
not GTO, exploitability, whole-game strength or real-world win-rate measurements.

## Historical reanalysis after main advances

Commit `79d5b64` preserves the exact frozen study checkout, including the reviewed
archives. Newer main commits may change files in the broad frozen source inventory,
so v1 commands intentionally reject that newer checkout. Do not regenerate or edit
the manifest to make later application changes pass. For historical reanalysis,
use a separate checkout at `79d5b64`, install its lockfile dependencies, and copy the
retained `benchmarks/results/river-candidate-v1/` checkpoints into that checkout.
Then run `npm run benchmark:river-candidate -- analyze` only. The checkpoint files
remain local and Git-ignored; the committed development archive also retains every
paired block. Keep the original checkpoint directory for the runner's independent
archive/checkpoint comparison. No new study or simulations are needed.

## Promotion and verification handoff

After the user's manual run, review the summary/artifacts, verify manifests and
rerun **analysis only**. If no difficulty qualifies, record defer and leave production
unchanged. If a difficulty qualifies, preserve the verified recoverable frozen
baseline, add the tested override as a narrow layer over current Rules for those
difficulties only, retain the existing KK opening, and retain every support bound
above. Update gameplay/architecture documentation with eligibility and limitations.
Run `npm run check` and record successful required checks after promotion; a manual
handoff is not a pass. Deployment is outside this study. No promotion has happened
as part of this implementation.

Focused regression tests cover projection isolation, independent seeds, suit/seat
symmetry, exclusion predicates, rounded/unavailable sizing, real Rules raise
continuations, terminal payouts/refunds/ties/conservation, scripted safeguards,
immutable checkpoint recovery, drift/corruption/failure retention and deterministic
cluster analysis. Existing Rules/KK tests remain in the normal `npm run check` suite.
No build, migration or live service is needed for these benchmark-only changes.

See [implementation verification](verification-2026-10-18.md) for recorded checks and the manual handoff.
