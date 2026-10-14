# Explicit heads-up Jev evaluation — 14 October 2026

Keep the current production policy. This experiment did not find a suitable
reusable full-action chart source and did not demonstrate useful opponent-specific
memory adaptation. No chart-policy rollout is supported by these results.
Production bots, model settings and database behavior remain unchanged.

| Evidence category | Result | Interpretation |
| --- | --- | --- |
| Reference coverage/compliance | No source accepted; zero supported nodes | Unmeasured; no chart-dependent calls |
| Memory sensitivity | 108 successful Jev decisions; zero provider failures | Limited behavioral observations, no quality grade |
| Frequent folding vs calling | Enabled-statistics TV distance 0 in all six situations | No observed response to this opponent contrast |
| Match performance | No paid hands/blocks | No measured BB/100 advantage |

For JTs on the button, statistics-enabled Jev raised to 2 BB in all nine decisions
(three histories × three repetitions). Omitted-statistics Jev raised in four of
nine and limped in five. This suggests sensitivity to the presence of session
statistics; it does not isolate beneficial opponent adaptation. The omitted
prompts are identical across histories, providing a stochastic control. Frequent
folding and calling produced the same distribution with either mode in all six
situations. For weak button 72o, insufficient-statistics Jev limped once and folded
twice; all other button-weak groups folded. Remaining decisions were stable:
weak BB folded, suited/pair BB called, premium button raised to 2 BB.

Three repetitions per cell are too few to infer stable frequencies or causality
from a single differing decision. The situations are six fixed preflop states,
not a representative test of all streets or opponents. No independent reference
passed, so changes receive no EV/quality score. No results establish Jev strength.
Median observed provider decision latency was 248 ms; usage/cost fields were not
available, so no spend estimate is invented.

The source audit started with `amaster97/poker_solver` at
`f78f1b2bc338dd8cbb5226ecb8398bbdb3635676`. Its exported preflop strategies assume
postflop checkdown equity on non-all-in leaves. Valid normalized frequencies and
25,000 iterations do not make that a full-action HUNL oracle. Other reviewed
candidates were manual ranges, push/fold-only, equity-realization models, or lacked
verified reusable data terms and solver configuration. See the
[audit/protocol](heads-up/README.md), [source inventory](evidence/jev-hu-sources-2026-10-14.json)
and [independent structural verification](evidence/jev-hu-source-verification-2026-10-14.json).
No new solver data was generated and no access was purchased.

The original pilot evidence is unchanged. The new tooling includes a strict
reference importer, exact state/line matching, independent seeded sampler,
conditional reference EV regret and descriptive frequency measures, frozen
situation-level held-out selection, full-hand four-hand paired comparisons,
whole-block bootstrap and persistent request budgeting. Synthetic reference tests
verify mechanics only. All implementation stays under benchmark ownership.

Paid request accounting: **108 additional provider requests**, all successful;
0 compatibility probes, 0 chart-decision requests, 0 match requests, 0 retries.
The first credential-less invocation made 108 local decision attempts but sent
no HTTP requests; its separate ledger is preserved, and a subsequent credential
preflight failure also sent none. The user then provided the credential and
authorized continuation. Even counting all local failures as experiment attempts,
the combined 216 decision attempts remain below the fresh 1,000 ceiling. Unused
chart allocations were not transferred to memory. The successful paid memory run
is exactly the prescribed 6 × 3 × 3 × 2 = 108 calls.

The successful [evidence](evidence/jev-hu-memory-live-2026-10-14.json) includes
sanitized actions, policy versions, failure classifications, latency, group
frequencies, frozen dependency hashes and a deterministic input checksum. Its
[manifest](evidence/jev-hu-memory-live-2026-10-14.json.manifest.json) records SHA-256.
The [verification manifest](evidence/jev-hu-verification-2026-10-14.json) lists
checks and artifact hashes. Credentials remain in ignored local environment files.

Validation passed: `npm run check` (122 files, 1,650 tests),
`npm run benchmark:jev:heads-up`, `npm run benchmark:poker-context` and offline
`npm run test:bots` (60 passed; 60 external-provider tests skipped). No routing,
rendering, deployment or schema code changed; a Next.js build/SQL/live-browser
run is not applicable to this evaluation-only change. Tests cover strict import,
169 classes/1,326 weights, seeded sampling, exact matching, unsupported fallback,
EV arithmetic, hidden-card invariance, four-hand symmetry, budget exhaustion,
long hands and fixed memory inputs.

Next evidence needed: a reusable, independently audited full-action no-rake/no-ante
dataset with exact supported stack/action configurations and adequate postflop
modeling. Only then freeze the held-out situations and authorize a fresh paid
chart/match run. Useful memory adaptation also needs a stronger decision-quality
reference or separately authorized completed-hand evidence. Production rollout
remains a separate decision.
