# Curated benchmark evidence

Keep dated, sanitized results here for future comparisons. Routine generated
reports remain ignored in `benchmarks/results/`; explicitly preserve useful runs
in this directory together with their human-readable interpretation.

- [2026-10-14 heads-up pilot report](../heads-up-pilot-2026-10-14.md)
- [Detailed decision and match results](heads-up-pilot-2026-10-14.json)
- [Run metadata and SHA-256 checksum](heads-up-pilot-2026-10-14.manifest.json)

The snapshot includes all fixed decisions, provider failures, available numeric
latency/token/cost data, valid match blocks and excluded match records. Preserve
opportunity denominators, billing gaps and exclusion reasons when comparing runs.
The manifest identifies models, reasoning settings, context versions and budget.
No exact source commit was recorded at execution; do not imply otherwise.

Preserve existing dated snapshots; add a new dated file for a new run. Document
corrections explicitly rather than silently replacing evidence. Before promotion,
verify an allowlist of fields and omit credentials, raw provider requests/responses,
private game states, ownership tokens and historical cards. Only fixed synthetic
case identifiers and sanitized metrics belong here. Do not copy application logs,
status dumps or production data into this directory.
