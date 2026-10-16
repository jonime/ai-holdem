# Focused bot improvement experiment v1

Benchmark-only follow-up to the [production audit](../bot-audit/report.md).
Production registry, strategies, prompts, models, API and database are untouched.
The original audit and evidence stay immutable. Eevo is excluded.

The [dated report](report-2026-10-15.md) records the completed run: 600/600
engine-accepted paid decisions, 72,000 completed offline hand attempts, no failures
or exclusions. The authorization is exhausted. Preserve the ignored local ledger
and committed archives; do not replay this allocation. All candidates remain
benchmark-only pending a separate production decision.

## Candidates and offline comparisons

The provider candidate orders hero holes consistently, labels occupied seats in
cyclic hero-relative order, and remaps history, situation, session statistics and
recomputed advice/facts together. Board chronology, chip values, candidate actions
and model settings stay fixed. Tied best-five representatives are recomputed with
ordered holes so accidental engine tie selection does not leak input ordering.
Returned actions are validated on the original authoritative engine state.

The Rules candidate copies production strategy at `17cfc52` and changes only its
deterministic choice seed. The seed uses visible cards with canonical global suits,
hero-relative seats, exact reduced big-blind ratios for history amounts and sorted
hole cards. Hand number and action chronology remain inputs. It uses no hidden
cards, identities, provider calls or inferred ranges. Difficulty thresholds are
unchanged. Canonicalization is not proof of stronger play.

```sh
npm run benchmark:bot-improvements
```

The offline archive writer also refuses to overwrite preserved evidence. A new
full offline experiment needs a separate version/output location before starting;
analysis of existing evidence is repeatable.

This command loads no environment files, blocks fetch, and gives match workers no
credentials. It traces five premium classes through all eleven existing preflop
nodes and three difficulties at 5,000 equity samples. UTG additionally gets an
independent 20,000-sample random-hand estimate. It checks all original audit
representations and enumerates all 24 suit permutations, sixteen hand numbers,
five representations and medium/hard on the focal turn draw at fixed equity.

Matches reuse the existing engine-backed runner and frozen/passive/aggressive
opponents: 500 paired seed blocks × all three difficulties × two/six seats, with
every subject rotation. Both arms share the frozen legacy context and 100-sample
equity so this isolates the seed change. Preserve all eighteen groups and exclude
an entire seed block across both arms when any hand fails. Use the existing seeded
2,000-resample whole-block bootstrap. Low sampling, heuristic opponents and reused
seeds limit conclusions; intervals are exploratory without multiplicity correction.
The prior bundled Rules challenger is not promoted by this experiment.

## Completed live pilot (historical commands)

```sh
npm run benchmark:bot-improvements:prepare
EXTERNAL_INFERENCE_ENABLED=true BOT_DECISION_CALL_CAP=600 \
BOT_IMPROVEMENTS_AUTHORIZATION=approved-600-jev-openrouter-v1 \
npm run benchmark:bot-improvements:live
npm run benchmark:bot-improvements:analyze
```

The source freeze/input plan already exist; prepare intentionally refuses to overwrite
them. The commands above document the completed run, not authorization to repeat it.
Prepare makes no requests and exclusively creates a new source freeze/input plan.
Live loads only optional `.env.test` (existing process variables take precedence),
requires Jev/OpenRouter keys and the exact OpenRouter endpoint, and verifies the
freeze and all planned inputs before creating an exclusive durable ledger.
OpenRouter uses `openai/gpt-5.4-mini`, low reasoning, balanced playstyle, no fallback.
Jev retains its current production confidence wrapper and model setting.

The authorized allocation is 600 attempts, 300 per provider and 150 per arm:
480 representation requests (four fixtures × original/hole-order/seats × ten
repetitions × two providers × two arms) and 120 preflop requests (AA/KK/QQ/JJ/AKo ×
HU opening/BB defense × three repetitions × two providers × two arms).
Representation fixtures are `3-preflop-suited`, `4-turn-draw`,
`5-river-board-kicker`, and `HU-turn-capped-call`. Controlled equity stays fixed.
The deterministic order rotates arms/providers/representations within repetitions.

Every attempt is reserved durably before its single request. Failures consume
allocation. No retries, resume, compatibility probes or replacement calls are
permitted. Existing ledgers prevent replay, including after interruptions.
Archive a completed sanitized ledger before any later separately authorized run.
The cap limits requests, not money; missing Jev cost is unknown. Retain only
sanitized decisions, allowlisted model/usage/cost metadata and hashes; never raw
responses, reasoning, headers, cards from real games or credentials.

## Interpretation and checks

Report action-type and action/size distributions, same-input disagreement,
matched contrasts with exclusions, premium-hand concentration, failures, latency
and cost coverage separately for each arm/provider. Ten repetitions remain a pilot;
more consistent outputs alone establish neither EV gain nor optimal mixing.

Run `npm run check`, offline `npm run test:bots`, and
`npm run benchmark:poker-context`. No SQL, browser or deployment check is needed
for benchmark-only changes. End with an adopt/defer/reject recommendation for each
candidate. Production promotion and further spending require a subsequent decision.
