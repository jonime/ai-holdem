# Plan 3 offline evidence

Implementation includes the versioned confidence-aware advice, twelve replay-backed
situations, source/policy freeze, 960-request capped pilot, partial sanitized reports,
and separate policy/history contrasts. Production code and settings are unchanged.
The [guide](README.md) describes the interventions and paid-run prerequisites.

The full offline matrix completed **960 scripted decisions with zero failures**:
12 situations × 4 histories × 2 policies × 2 providers × 5 repetitions.
All 96 policy contrasts had five complete pairs (480 paired comparisons), zero
changed actions and no insufficient-history adaptation flags. Scripted responders
choose passive legal actions irrespective of advice, so these zeros verify wiring,
not adaptation or playing strength. No provider tokens or cost are available.
This offline implementation initially made **0** paid requests. The subsequent
authorized v1 execution and its limitations are recorded in the
[live evidence report](live-report-2026-10-14.md).

Advice coverage is deliberate:

| Situations | Omitted | Insufficient | Frequent folds | Frequent continuation |
| --- | --- | --- | --- | --- |
| HU small-open preflop | none | none | per <=3 BB candidate | per <=3 BB candidate |
| HU large-open preflop | none | none | per >3 BB candidate | per >3 BB candidate |
| HU flop/turn/river | none | none | target opponent/street | target opponent/street |
| MW preflop (both) | none | none | none | none |
| MW flop/turn/river | none | none | target opponent/street | target opponent/street |

Multiway preflop aggregates lack the required situational BB fold metric; suppression
is the correct result. Three-player postflop evidence remains about one opponent.
Sparse evidence uses an ownership change and at most four recent opportunities.
The committed [compact evidence](offline-evidence.json) preserves exact coverage,
report checksum and paired denominators. Routine full rows/latency diagnostics are
in ignored `benchmarks/results/opponent-advice-offline.json`; timing is local wiring
latency and has no provider-latency interpretation.

Focused tests verify Wilson numerical values, threshold/sparse boundaries, malformed
counts, size and street matching, unknown history, all-in exclusions, immutable
ownership resets, forced departures, missing/rejected replay, historical and current
hidden-card invariance, request-only advice injection, unchanged schema/candidates,
one request per decision, fixed mini settings and failure-inclusive shared caps.

Validation:

- `npm run benchmark:opponent-advice`: 960 offline decisions, zero failures; paid test skipped.
- `BOT_SCENARIO_LIVE=false npm run test:bots`: 60 passed; 120 external cases skipped.
- `npm run benchmark:poker-context`: two offline tests passed; paid test skipped.
- `npm run check`: lint and strict typecheck passed; 132 test files and 1,843 unit tests passed after final changes.

No build or SQL changes were made. Earlier experimental evidence remains untouched.

No conclusion about improved behavior or win rate is available from the scripted
matrix. After fresh explicit paid authorization, use the frozen capped pilot to
compare the two policies against omitted stochastic controls and inspect unsupported
adaptation on sparse observations. Only independently established exact failures
are graded; ordinary bluff/action/sizing differences are ungraded. Recommend a
separately budgeted full-hand experiment only if real pilot results justify it.


A subsequent audit found that the v1 omitted condition drops HERO's statistics.
Its history-versus-omitted contrasts are confounded. The corrected v2 control
omits only the target opponent and passed another complete 960-decision offline
matrix with zero failures. It has a separate source freeze and focused all-condition
invariance test; no v2 paid run was performed. See the [guide](README.md#paid-run-limitation-and-corrected-controls).
