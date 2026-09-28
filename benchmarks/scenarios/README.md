# Bot decision scenarios

Run `npm run test:bots` to evaluate the offline equity bot on eight reproducible
river positions at easy, medium, and hard difficulty. Each bot has its own named
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

# Live TypeSafe only: 24 decisions per repetition (8 cases x 3 difficulties)
BOT_SCENARIO_LIVE=true EXTERNAL_INFERENCE_ENABLED=true npm run test:bots -- -t 'jev'

# One live LLM, all profiles: 24 decisions per repetition (8 cases x 3 profiles)
BOT_SCENARIO_LIVE=true EXTERNAL_INFERENCE_ENABLED=true npm run test:bots -- -t 'my-llm'

# One LLM profile: 8 decisions per repetition
BOT_SCENARIO_LIVE=true EXTERNAL_INFERENCE_ENABLED=true npm run test:bots -- -t 'my-llm.*tight'

# All bots, including TypeSafe and every configured LLM
BOT_SCENARIO_LIVE=true EXTERNAL_INFERENCE_ENABLED=true npm run test:bots

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

Keep `BOT_SCENARIO_LIVE=true` in the command when opting into live scenarios. Live runs incur provider charges;
CI never runs them. A timeout or provider failure is not evidence of bad poker.
The command uses the production registry, playstyle validation, context options,
and decision implementations. TypeSafe receives its production corrected
contestable-pot context; the other bots receive their current production context.

## Reproducible states and extending the suite

`harness.ts` creates a real 1/2 blind, 200-chip heads-up hand with a fixed deck,
replays the preflop call and checks through the turn, then checks or bets the
river before asking seat 0 to act. The engine builds every pot and legal action.
The normal AI projection computes hand strength and deterministic sampled equity,
and includes the complete replay history without exposing opponent hole cards.

Add a named fixture to `scenarios`, with a unique deck prefix, river action,
forbidden actions, and a defensible explanation. Prefix order is seat 1's first
card, seat 0's first card, seat 1's second card, seat 0's second card, burn,
three flop cards, burn, turn, burn, river. Add fixture assertions for the intended
hand/equity and accepted/rejected decisions in `scenarios.test.ts`. Expand the
builder for other streets or stacks using adapter transitions, never by editing
engine internals or inventing analysis values.

`npm run check` verifies the fixtures and grading logic, including deliberately
bad fake decisions. `npm run test:bots` separately evaluates real bot quality and
may fail on existing weaknesses. Do not weaken expectations to make it green.

Equity Rules passes all eight scenarios at every difficulty. Its call decisions
use the legal call amount divided by the projected contestable pot, including
live bets and excluding unmatched chips. The shared legacy projection is left
unchanged for other providers. On heads-up rivers, the engine adapter checks all
990 unseen opponent holdings to establish a guaranteed minimum pot share;
unbeatable calls bypass heuristic safety margins. Sampled equity alone is never
used as proof that a hand cannot lose. Pressure counts opponent aggression only,
and semi-bluffs are disabled on the river. These safeguards do not turn the
random-hand equity estimate into an opponent range model or establish overall
playing strength.
