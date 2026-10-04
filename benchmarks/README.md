# Benchmarks and bot evaluations

- [Bot decision scenarios](scenarios/README.md): engine-backed legality and
  obvious-blunder checks, with opt-in live providers.
- [Game-state reads](game-reads.md): SQL verification, request counts, latency,
  and reveal query plans.

## TypeSafe policy evaluation

Run the deterministic, cost-free policy benchmark with seeded deals and each
seat assignment:

```sh
npm run benchmark:policy
```

It compares the frozen v1 policy surrogate and the v2 exact-move policy
surrogate against `equity-rules-v2` plus scripted passive and aggressive
opponents. The JSON report includes big blinds won per 100 hands, a 95%
uncertainty interval, action frequencies, failures, and decision latency. This
is a regression harness for policy mechanics, not evidence that Jev plays
stronger poker.

The current Jev wrapper policy is `typesafe-poker-v2.1`. Easy mode samples the
provider distribution without adding uniform randomness; medium and hard use
the provider's selected move. Before asking Jev, exact heads-up river evaluation
removes folds when calling guarantees nonnegative chip EV, calls that lose to
every possible holding, and bets/raises on a forced board split when checking or
calling is safe. These are candidate restrictions; the engine remains the final
legality authority. Ordinary uncertain positions still use Jev's decisions.

LLM bots use policy `llm-poker-v2.1-{playstyle}` and share these candidate
safeguards with Jev. The request schema and local response validation enforce
the same restricted action set for every playstyle. LLM context also corrects
call cost, pot odds, the contestable pot before calling, stack-to-pot ratio, and
bet/raise sizing for current street commitments and stack-capped calls. Provider
errors or excluded decisions are rejected rather than silently replaced.

Live Jev evaluation is deliberately separate from CI because it makes one paid
TypeSafe request per decision:

```sh
EXTERNAL_INFERENCE_ENABLED=true TYPESAFE_API_KEY=... npm run benchmark:typesafe:live
```

The live command uses seeded, seat-swapped deals and emits the same metrics.
Only statistically supported live comparisons should be used to claim stronger
play; passing unit tests or the mocked benchmark is insufficient.

Unit tests and benchmarks load the optional root `.env.test` before collection.
Existing shell/CI variables take precedence; `.env` is not loaded. `.env.test` is
ignored by Git. Live evaluations require their explicit opt-in flags.
