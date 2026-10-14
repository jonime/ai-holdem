# User-requested production Jev promotion

After the corrected pilot, the user explicitly requested enabling opponent advice
for Jev and pushing it to main. The server registry now uses
`ConfidenceAwareJevPokerBot`, policy `typesafe-poker-v4.1-confidence`, with the
same `jev-latest` model and the unchanged base questions, sampling, legal candidates,
response contracts and exact river safeguards. The user subsequently requested
the same advice for Eevo: the registry now uses `ConfidenceAwareEevoPokerBot`,
policy `eevo-poker-v4.1-confidence`, retaining `eevo-1`, its own client/key and
error mapping. Jev and Eevo share the exact advice-envelope builder. LLM and
Equity Rules behavior is unchanged.

The server-only advice version is `jev-opponent-advice-v2`. It retains the pilot's
Wilson calculation, ten-opportunity minimum, thresholds, privacy-safe attribution
and situational suppression. It adds explicit wording that observations are not
a current-action fold probability and cannot justify larger or all-in bets.
Ordinary pot-relative sizing is preferred; larger commitments need independent
hand/stack/price justification. It also excludes all-in opening candidates from
size-bucket tendency annotations and preserves value seeking against continuation.
All action candidates remain available; no fallback action or second request is added.

This differs from the paid experiment's `opponent-fold-advice-v1`. Offline tests
verify wiring, thresholds, suppression, sizing guidance, one request, unchanged
schema/candidates and privacy. They do not prove that a provider will follow the
new wording or that the new variant improves win rate. The [pilot evidence](live-v2-report-2026-10-14.md)
remains unchanged and is not relabelled as production strength validation.

Archival commit `62d7bc6` preserves the exact source dependency tree before registry
promotion; it was created after execution and is not an execution-time commit.
Frozen Plan 3 runners intentionally reject newer registry hashes. Reconstruct
that archived tree for offline comparisons without rewriting old evidence or
spending exhausted paid budgets. The generic `JevPokerBot` remains available as
an unmodified benchmark baseline.

No migration, new credential, model change or public UI/API change is required.
Existing session-context migration prerequisites still apply. Production services
retain authorization, claims, inference allowances, deadlines and explicit retries.
Deployment activates the registered wrapper for existing Jev seats too.

Validation before publication: `npm run check` passed lint, strict typechecking
and 1,851 tests in 135 files. Offline `test:bots` passed 60 tests (120 external
cases skipped); `benchmark:poker-context` passed two offline tests (paid test
skipped). `npm run build` completed successfully outside the restricted sandbox
after Turbopack stalled inside it. No additional paid inference was performed.


The Eevo follow-up reuses the established `jev-opponent-advice-v2` version tag,
including uncertainty thresholds and sizing cautions, without changing Jev's
supplied advice. Tests verify identical Jev/Eevo context and distinct models,
unchanged candidate/schema handling, one request, sparse/unknown suppression,
multiway targeting and Eevo errors without fallback. Eevo was not included in
the paid pilot; this extension has no measured behavioral-strength evidence.


Eevo follow-up validation: `npm run check` passed lint, strict typechecking and
1,855 tests in 136 files; `npm run build` succeeded. Offline bot scenarios passed
60 tests (external cases skipped), and the context benchmark passed its two
offline tests. The existing service already supplies the same validated session
statistics to all external providers, including Eevo; no new history query,
migration, credential or paid evaluation was needed.
