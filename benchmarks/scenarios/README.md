# Bot decision scenarios

Run `npm run test:bots` to evaluate the offline equity bot on twenty reproducible
preflop, flop, turn, and river positions at easy, medium, and hard difficulty. Each bot has its own named
`describe` group, each difficulty a nested group, and each scenario its own `it`
test. Configured LLMs have a group showing their bot id and model id, with nested
`balanced`, `tight`, and `aggressive` playstyle groups instead of difficulty.
Profiles come from the server-owned `LLM_PLAYSTYLES` catalog; each is passed to
the production bot registry. The shared LLM context retains `medium` difficulty,
which is not a configurable LLM setting.
TypeSafe and LLM groups are skipped unless live evaluation is explicitly enabled.
Failures show the visible context, action, reason, latency, and status (`illegal`,
`blunder`, or `provider-error`). Any failure produces a nonzero exit. The tests
need neither Supabase nor a running app. Raw provider responses are omitted.

These are deliberately strict examples, not a measure of overall poker strength:

| Scenario | Forbidden decision | Justification |
| --- | --- | --- |
| Free check with a weak hand | Fold | Checking costs nothing and retains the possibility of winning. |
| Royal flush facing a small bet | Fold | Hero cannot lose or split. |
| Royal flush facing an all-in | Fold | Bet size does not change the unbeatable hand. |
| Royal flush on the board facing an all-in | Fold | Calling guarantees a split and recovers chips already invested; the game has no rake. |
| Four aces facing an all-in | Fold | Hero has unbeatable quads on an unconnected board. |
| Rainbow broadway board facing an all-in | Fold | Every possible holding splits the pot. |
| Royal board facing a small bet | Fold or raise | Calling takes the guaranteed split; raising cannot earn additional chips. |
| Board quads with the lowest kicker facing an all-in | Call or raise | Hero cannot beat any holding and almost always loses; the price cannot justify calling. |

Except for the explicit restrictions above, bets, raises, and calls are accepted
where legal; these tests do not prescribe one exact sizing or ban reasonable bluffs. No expectation depends on knowing the
opponent's hidden cards. A pass only means no listed mistake was made.

## Commands

```sh
# All offline bots; external provider groups are skipped
npm run test:bots

# One bot, or several bots (Vitest -t matches the full test name as a regex)
npm run test:bots -- -t 'equity-rules-v2'

# One difficulty or scenario within a bot
npm run test:bots -- -t 'equity-rules-v2.*hard'
npm run test:bots -- -t 'equity-rules-v2.*free-check'

# Live TypeSafe only: 60 decisions per repetition (20 cases x 3 difficulties)
BOT_DECISION_CALL_CAP=100 EXTERNAL_INFERENCE_ENABLED=true BOT_SCENARIO_LIVE=true npm run test:bots -- -t 'jev'

# One live LLM, all profiles: 60 decisions per repetition (20 cases x 3 profiles)
BOT_DECISION_CALL_CAP=100 EXTERNAL_INFERENCE_ENABLED=true BOT_SCENARIO_LIVE=true npm run test:bots -- -t 'my-llm'

# One LLM profile: 20 decisions per repetition
BOT_DECISION_CALL_CAP=100 EXTERNAL_INFERENCE_ENABLED=true BOT_SCENARIO_LIVE=true npm run test:bots -- -t 'my-llm.*tight'

# All bots, including TypeSafe and every configured LLM
BOT_DECISION_CALL_CAP=100 EXTERNAL_INFERENCE_ENABLED=true BOT_SCENARIO_LIVE=true npm run test:bots

# Repeat to observe nondeterministic decisions (1–20; default 1)
BOT_SCENARIO_REPEATS=3 npm run test:bots -- -t 'equity-rules-v2'
```

`BOT_SCENARIO_BOT` and `BOT_SCENARIO_PROFILE` are no longer used; select bot
and profile groups with `-t` instead.

Live runs require `TYPESAFE_API_KEY`, or `LLM_API_ENDPOINT`, `LLM_API_KEY`, and
`LLM_BOT_MODELS`, in the process environment or the root `.env.test` file.
Both Vitest configurations automatically load `.env.test` when present, before
test collection. Existing shell/CI variables take precedence. `.env` is not
loaded. `.env.test` is already ignored by Git. For example:

```dotenv
TYPESAFE_API_KEY=your-typesafe-key
LLM_API_ENDPOINT=https://your-provider.example/v1/chat/completions
LLM_API_KEY=your-llm-provider-key
LLM_BOT_MODELS='[{"id":"my-llm","label":"My LLM","modelId":"provider/model","reasoning":"low"}]'
```

Keep `BOT_DECISION_CALL_CAP=100 EXTERNAL_INFERENCE_ENABLED=true BOT_SCENARIO_LIVE=true` in the command when opting into live scenarios. Live runs incur provider charges;
CI never runs them. A timeout or provider failure is not evidence of bad poker.
The command uses the production registry, playstyle validation, context options,
and decision implementations. TypeSafe receives its production corrected
contestable-pot context. LLM wrappers correct their legacy input to contestable-pot
odds and sizing before inference, and share Jev's exact river candidate safeguards.

## Reproducible states and extending the suite

`harness.ts` supports 2–6 seats, individual starting stacks, deterministic decks,
explicit seat/action sequences, and a specified decision-making seat. Every
transition goes through the production poker adapter. Before evaluation it checks
the actor, street, remaining stacks, live pot, hero cards, board, legal action
types and the committed bounds in `legal-actions.json`. The two short/side-pot
turn fixtures also assert the actual call and contestable pot amounts. Expectations
are stored fixture facts, never bot predictions or eventual runout grades.

`everyday.ts` adds four cases per street:

| Street | Cases | Visible features |
| --- | --- | --- |
| Preflop | Unopened six-seat, opening raise, multiway raised pot, short stack | Early position suited broadway, medium pair, suited connector, short ace-high; 6–100bb starting depths |
| Flop | Free check, made hand facing bet, draw facing bet, multiway | Dry weak hand, top pair, flush draw with overcards, middle pair on connected board |
| Turn | Draw improvement, missed draw under pressure, short call with unmatched chips, multiway side pot | Made flush, unpaired draw, capped call, all-in opponent plus side-pot action |

The original eight river expectations remain unchanged. The new free-check case
forbids folding. All other new choices are informational: calls, folds and legal
aggression are accepted, with no mandated ranges, bluff frequencies or sizing.
Each case records its purpose and a strategy observation separately from grading.
`illegal`, `blunder`, and `provider-error` remain separate failures; a `pass` means
only that no specified invariant failed. The grader applies the decision through
the engine before checking strategy restrictions.

Context construction matches `bot-turn-service.ts`: 5,000 deterministic random-hand
equity samples; complete adapter-replayed history projected with `projectBotHistory`;
Rules uses `legacyDecisionHistory`, legacy pot/call projection and
`createLegacySizingOptions`; Jev/LLM use enriched history, corrected projection and
`createSizingOptions`, followed by their ordinary provider wrappers. Fixed opponent
holdings and undealt cards never enter context or equity sampling. Regression tests
change hidden/burn/undealt cards while preserving hero/board and require identical
contexts for all three provider paths.

Add fixtures with explicit expected visible facts and legal bounds; update the
committed bounds only after inspecting the adapter result. Do not grade using
fixed opponent cards or a later runout. `npm run check` covers fixture assertions,
privacy and fake illegal/bad/acceptable decisions. `npm run test:bots` evaluates
real bots separately. Live opt-ins, the shared call cap, model/profile filters
and sanitized reporting apply to all twenty fixtures; no live calls were made
for this expansion.

The [offline evaluation report](evaluation.md) explains the baseline and why no
strategy correction was justified. To regenerate its per-decision records:

```sh
BOT_SCENARIO_LIVE=false BOT_SCENARIO_REPORT=true npm run test:bots -- -t 'equity-rules-v2'
```

This writes `equity-rules-baseline.json` with the Git revision, context settings,
action amounts, sizing labels, matched rules, equity and grading outcomes. Use
the complete single-repeat Rules suite when recording; normal runs write no files.

Equity Rules still uses the legal call amount divided by the contestable pot,
including live bets and excluding unmatched chips. Heads-up river safeguards use
exact minimum pot shares over all unseen holdings; sampled equity never proves
a guaranteed outcome. These checks do not establish an opponent range model or
overall playing strength.

Jev policy `typesafe-poker-v2.1` also passed all 24 decisions in a live run.
The prior wrapper failed 4/24 in the baseline run; prompt clarification alone
still failed 4/24 (with different easy-mode errors). The final wrapper removes
uniform random exploration from easy mode and excludes provably bad heads-up
river candidates using exact minimum/maximum showdown shares: folding a safe
unbeatable call, calling a certain loss, or betting/raising a forced split.
Uncertain decisions remain provider-owned. Offline regression tests verify the
candidate restrictions, including a beatable ace-high flush and rejection of a
provider returning an excluded move. A live pass confirms the wrapper/service
integration on these fixtures, not an improvement in the underlying Jev model.

The configured `gpt-5-nano` (`openai/gpt-5-nano`) passed 24/24 live scenarios
across balanced, tight, and aggressive playstyles after the LLM wrapper update
(`llm-poker-v2.1-{playstyle}`), compared with 10/24 in the baseline. All baseline
failures were blunders, not provider errors. These fixes apply to every configured
LLM bot, but this live result covers only that model and configuration. Offline
tests enforce matching request-schema and response-validation restrictions,
correct live-bet sizing and short-stack odds, and retention of uncertain choices.

```sh
# Run the configured GPT models on synthetic fixtures (paid external calls)
BOT_DECISION_CALL_CAP=100 EXTERNAL_INFERENCE_ENABLED=true BOT_SCENARIO_LIVE=true npm run test:bots -- -t 'gpt'
```
