# Authorized Plan 3 pilot — 2026-10-14

**Outcome: incomplete and inconclusive. Do not promote the challenger.**
The original authorized cap was respected. The run recorded 960 attempted cells:
721 failed under restricted network access, then 239 unattempted cells completed
successfully with provider access. No failed cell was retried, no model was
substituted, and no additional requests were authorized or made.

The initial launch should have checked network access before starting inference.
It instead ran in the restricted environment and consumed 721 ledger slots before
being stopped. These failures are recorded as network failures, not poker errors;
none returned a decision or billing information. A no-inference HEAD check then
confirmed connectivity outside the restricted environment. The separate continuation
runner validated the original input checksum and ledger, skipped all 721 recorded
cells, and permitted only the remaining 239 decisions. It completed without new
provider, output-contract or engine-validation failures. The combined ledger has
960 rows and 960 reservations; success coverage is **239/960 (24.9%)**.

## Providers, latency and billing coverage

| Provider | Attempted cells | Successful responses | Network failures | Median / p95 successful latency | Reported cost coverage |
| --- | ---: | ---: | ---: | --- | --- |
| Jev (`jev-latest`, medium) | 480 | 119 | 361 | 0.326 / 0.459 seconds | unavailable, 0/480 attempts |
| `openai/gpt-5.4-mini`, low, balanced | 480 | 120 | 360 | 4.299 / 7.879 seconds | $0.26649165, 120/480 attempts |

The known OpenRouter subtotal covers its 120 successful requests only. Jev and
failed-request billing are unknown; **$0.26649165 is not complete pilot billing**.
Numeric token usage and per-request successful latency are retained in the snapshot.
Current production prompts/settings remain unchanged; the challenger only adds
benchmark advice to requests. Both policies retain the same candidates and exact
safeguards. No successful decision failed the engine's action validation.

## Matched policy contrasts

Only 119 of 480 planned policy pairs have both responses; 361 pairs are excluded.
Each table entry mixes fixed cases with explicit denominators, not population
poker frequencies or win-rate estimates. Successful coverage generally provides
one or two repetitions per cell rather than the planned five.

| Provider | History | Complete pairs | Changed action or size | Changed action type | Advice-eligible pairs |
| --- | --- | ---: | ---: | ---: | ---: |
| Jev | omitted | 14 | 2 | 2 | 0 |
| Jev | insufficient | 15 | 2 | 2 | 0 |
| Jev | frequent folding | 15 | 5 | 4 | 13 |
| Jev | frequent continuation | 15 | 1 | 1 | 13 |
| mini | omitted | 15 | 8 | 2 | 0 |
| mini | insufficient | 15 | 4 | 1 | 0 |
| mini | frequent folding | 15 | 8 | 2 | 13 |
| mini | frequent continuation | 15 | 10 | 3 | 13 |

Omitted current/advice requests are identical, yet actions/sizes differ. That is
stochastic variability. Mini's fold-conditioned changes equal its omitted-control
change count; Jev's fold-conditioned count is larger, but coverage is too small
to distinguish a useful effect. More pressure, a different size or a changed action
is ungraded, not an established improvement. Multiway preflop contributes no
advice because the current aggregates lack situational BB response evidence.
These two cases serve as suppression controls rather than invented adaptation.

## Control flaw and correction

An audit during the run found an implementation defect: the v1 omitted condition
removes all session statistics, including HERO's fixed image. Therefore v1
**history-versus-omitted** comparisons are confounded. Within-history current/advice
pairs still hold HERO statistics, cards, stacks and lines constant; omitted policy
pairs still receive identical requests. Preserve those distinctions when interpreting
the raw summaries. The 14 insufficient-history flags are review flags from
confounded comparisons, not proven unsupported adaptation or exact poker mistakes.

The frozen paid inputs were not changed mid-run. A separate
`opponent-advice-twelve-v2` wraps the original fixture code and omits only the target
opponent, holding HERO, unrelated opponents, coverage and decision context fixed
across every history condition. Its focused all-condition invariance test and
full **960-decision offline matrix passed with zero failures**. That correction
made no paid requests and has no paid entry point. The v1 results must not be
relabelled as v2 evidence.

## Preserved evidence and recommendation

- [Combined sanitized rows and summaries](../evidence/opponent-advice-live-2026-10-14.json)
- [Original network-failure ledger](../evidence/opponent-advice-network-failures-2026-10-14.json)
- [Input/source/model metadata](../evidence/opponent-advice-inputs-2026-10-14.json)
- [Continuation runner hash and original-ledger checksum](../evidence/opponent-advice-continuation-2026-10-14.json)
- [Derived counts, paired exclusions and SHA-256 checksums](../evidence/opponent-advice-analysis-2026-10-14.json)

The exact synthetic public contexts remain in the ignored local run manifest;
curated evidence contains no raw provider requests/responses, credentials,
ownership tokens, historical holdings or private engine states. Frozen fixture
sources reproduce the public contexts for input-checksum verification. Earlier
context, range-equity and rules evidence remains untouched.

All **1,844 unit tests**, lint and strict typechecking passed after the continuation
and corrected offline controls were added. The v1 live continuation completed
its 239 allocated decisions; the corrected v2 offline matrix completed 960.
Existing offline bot/context regressions passed during initial implementation.
No application, schema or deployment behavior changed, so no build/SQL checks
were required.

This fixed-decision pilot does not establish better poker or a win-rate improvement.
Missing responses, the original control flaw and deep synthetic stacks limit its
interpretation. **Do not promote or start a full-hand strength experiment based
on this evidence.** If further work is desired, first separately authorize a new
budget and freeze a corrected v2 fixed-decision runner with a no-inference network
preflight and an early-stop policy for infrastructure failures. The present
approval is exhausted; no additional paid execution will run automatically.
