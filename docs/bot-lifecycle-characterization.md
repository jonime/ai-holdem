# Client bot lifecycle extraction characterization

Before extraction, the production browser run passed all 28 tests in
`test/e2e/bot-advancement.spec.ts` plus a matching end-game bot error scenario.
The existing scenarios characterize provider pauses across version-only refreshes,
claim waits/expiry/loss, fair-use countdowns, conflict refresh, human-action
continuation, eligibility loss and navigation. Helper characterization additionally
covers the twelve-step bound and deferred response invalidation.

A broad combined selection also failed seven existing gameplay/lobby tests before
extraction. Quick Play's captured error page showed the real creation allowance
being exhausted; the application remained at `/en-US/quick-game` with a creation
limit message. Other failures in that selection included missing lobby controls
and failed creation expectations. Keep the production bot selection and smoke
selection separate; do not weaken admission policy or reset ordinary local data
to make a combined run pass.

The old implementation's bot loop was guarded, but navigation and retry refreshes
used independent refs. The extracted lifecycle uses a generation fence for both
steps and retry refresh reconciliation, including leaving and returning to the
same game and losing then regaining eligibility. These are the explicit extraction
acceptance requirements; they do not cancel server inference. Provider failure
identity remains game/hand/actor; version-only polling during a pending provider
request must still preserve a subsequent failure pause. Claim and usage notices
retain version fences. Claim and usage timer expiry only changes presentation/retry availability.
