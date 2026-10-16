# Offline validation; paid pilot pending

Production remains on the current menu. This record describes the original offline validation only. No inference was
executed during that validation. The subsequent authorized pilot and its usage
shortlist are documented in [the paid report](live-report-2026-10-16.md); no strength
claim or production promotion is supported.

The committed `offline-evidence.json` contains 48 fixture/menu cells (16 × 3),
with a single deterministic 5,000-sample equity calculation per fixture shared
across variants. All real Jev/Eevo confidence wrappers and the real LLM schema,
response parser and validators accepted scripted choices. Both new sizes were
scripted when available; all menu candidates were applied through the engine.
Every eligible fixture retained distinct legal non-all-in additions; all four
controls retained their current menus. This proves mechanical compatibility only.

Validation completed:

- `npm run check`: lint, strict TypeScript and 145 files / 1,997 tests passed.
- Offline `BOT_SCENARIO_LIVE=false npm run test:bots`: 60 passed, 180 live-only skipped.
- `npm run benchmark:poker-context`: 2 passed, 1 paid-only skipped.
- `npm run benchmark:bet-sizing`: full 5,000-sample matrix passed.
- Focused bet-size tests: 17 passed, including pre-refactor request hashes,
  real side pots, hidden-card invariance, request debit/exhaustion, stopping,
  complete-block exclusions and the predeclared screening boundary.

The production build was attempted but stopped after remaining at compilation
beyond a quick verification run. The user subsequently confirmed `npm run build` passed. No deployment was performed.

The prepared plan contains exactly 960 requests, zero paid compatibility calls,
and a hard shared ceiling of 1,000. Its 358 source hashes and manifest digest were
verified after preparation. The unused ceiling cannot fund repetitions or retries.
The subsequent live run was explicitly authorized and completed; that allocation
is now exhausted. Its provider behavior, latency, invalid-output rates and cost
coverage are recorded in the paid report. Eevo has no paid behavioral or strength
evidence.

A subsequent paid analysis can identify usage-screen candidates only after the
complete pilot passes every mechanical check. Any strength/production decision
requires the separately authorized paired-match study described in the guide.

The first authorized live launch failed during preflight-module import, before
ledger creation or inference. See `preflight-amendment.json` and the guide's
Node live-startup repair section. The original freeze and this offline evidence
remain preserved. The new freeze changes only startup runner/helper/test sources;
the 960 decisions and every experimental input remain identical.
