# AI Hold’em

An open-source no-limit Texas Hold’em game for two to six human and AI players.
Play against Equity Rules, TypeSafe Jev, or configurable LLM bots; the poker engine remains
authoritative for cards, turns, legal actions, betting, pots, and winners.

[Play AI Hold’em](https://www.aiholdem.gg) ·
[Source code](https://github.com/jonime/ai-holdem)

## Overview

- Play privately, invite friends, or watch bots play.
- Customize seats, bots, stakes, and LLM playstyles.
- Follow legal actions, completed-hand results, and an Actions timeline.
- Persist games, hands, and actions in Supabase.
- Validate every human and bot action server-side before committing it with a
  game-version check.
- Use localized pages in twelve languages, including Japanese and Simplified Chinese.
  English uses unprefixed URLs; other languages retain locale prefixes such as `/fi-FI`. Choose a language through
  the language menu; browser language never redirects pages.

Active hole cards are visible only to the browser that owns the seat. Tables are
unlisted by default, but anyone who knows a table URL can view it. Anonymous
identity cookies provide seat ownership for this game, not production
authentication.

## Play

- **Quick Play vs AI**, on the home and Play pages, immediately starts a private six-seat game with five
  server-selected bots, 50/100 blinds, and 10,000-chip stacks. With external
  inference disabled, all five bots use Equity Rules.
- **Play → Create table** opens a private six-seat lobby. The host can configure
  a 2–6-seat table, invite players, add bots, and start with two occupied seats.
  Hosts can also stand up to watch a bot-only table.
- **Play** shows up to five recently active tables owned by this browser and lists published waiting tables with open seats. Private
  tables remain accessible through invite links.

**Lobby** returns to Play while preserving seats. If you own a human seat, including
the last human, **Leave table** confirms departure, folds on your next legal turn, and releases
your seat after the hand. **Stand up** uses the same departure rules and keeps
you watching. Closing a tab alone does not register departure.

Bots and departing humans advance while an eligible host or seated human keeps the table open.
Other spectators watch passively; new hands require explicit interaction.
See the [gameplay guide](docs/gameplay.md) for betting controls, invitations,
watching, results, and the Actions timeline.

## Local setup

Use Node.js 24 or newer (`.nvmrc` selects Node 24).

### 1. Install dependencies

```sh
npm ci
cp .env.example .env
```

### 2. Configure the environment

Set the Supabase connection details in `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
USAGE_LIMIT_HASH_SECRET=
```

Generate a separate secret for each environment with `openssl rand -hex 32` and
paste it into `USAGE_LIMIT_HASH_SECRET`. This server-only value is required even
for local development and rules-only games. Keep it stable across deployments
and never commit it. Missing or short values make Quick Play and custom table
creation return `503 USAGE_UNAVAILABLE`. Restart the server after changing `.env`.
For Vercel, set a separate production value in the project's environment variables
and redeploy; see [fair-use setup](docs/fair-use.md).

To play with Equity Rules without provider credentials, set:

```env
EXTERNAL_INFERENCE_ENABLED=false
```

Equity Rules runs without external inference. The application still requires a
Supabase database, either local or hosted.

For TypeSafe Jev or LLM bots, enable external inference and configure the
corresponding provider:

```env
EXTERNAL_INFERENCE_ENABLED=true
TYPESAFE_API_KEY=
LLM_API_ENDPOINT=
LLM_API_KEY=
LLM_BOT_MODELS=[]
```

`LLM_API_ENDPOINT` is an OpenAI-compatible chat-completions endpoint.
`LLM_BOT_MODELS` is a JSON array with `id`, `label`, `modelId`, and optional
`reasoning`: `none`, `minimal`, `low`, `medium`, `high`, or `xhigh`.
Reasoning defaults to `minimal` when omitted.

```env
LLM_BOT_MODELS='[{"id":"my-llm","label":"My LLM","modelId":"provider/model","reasoning":"low"}]'
```

LLM playstyles (Balanced, Tight, Aggressive) are server-owned and selected
independently of model configuration; custom prompt text is not accepted.

`SUPABASE_SECRET_KEY`, `TYPESAFE_API_KEY`, and `LLM_API_KEY` are server-only.
Never give them a `NEXT_PUBLIC_` prefix or commit `.env`.
See [`.env.example`](.env.example) for all settings, including the optional
canonical public origin.

### 3. Apply database migrations

Apply every SQL file in [supabase/migrations](supabase/migrations) in filename
order to your Supabase project using the SQL Editor or a configured migration
workflow. Keep the Supabase Data API enabled.
See [deployment guidance](docs/deployment.md) for automatic migrations and rollout
prerequisites.

### 4. Start the application

```sh
npm run dev
```

Open [localhost:3001](http://localhost:3001).

## Development

```sh
npm run check
```

This runs ESLint, strict TypeScript checking, and Vitest without live Supabase
or TypeSafe services. Also run `npm run build` for changes affecting routing,
rendering, environment handling, or deployment behavior.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor workflow, translations,
local Supabase E2E and SQL checks, HTTP contracts, and deployed Realtime verification.
Bot evaluations and benchmarks are documented in [benchmarks/README.md](benchmarks/README.md).

## Deployment

Import the repository into Vercel, use the default Next.js build settings
(`npm run build`), and configure the environment variables for Production and
Preview. Apply required database migrations before deploying application code.
The canonical domain defaults to `https://www.aiholdem.gg`. To override it, set
`NEXT_PUBLIC_APP_URL` before building.
See the [deployment guide](docs/deployment.md) for the full procedure.
Enable Speed Insights in the Vercel project dashboard to collect Web Vitals;
the application includes its SDK with private table URLs redacted.

## Documentation

- [Gameplay](docs/gameplay.md): lobby, betting controls, watching, and results.
- [Architecture](docs/architecture.md): bot advancement, Realtime, discovery,
  state reads, and feed synchronization.
- [Deployment](docs/deployment.md): Vercel, migrations, and search metadata.
- [Fair use](docs/fair-use.md): anonymous allowances, privacy, and configuration.
- [Contributing](CONTRIBUTING.md): development rules and verification.
- [Benchmarks](benchmarks/README.md): policy, scenario, and game-read evaluations.
- [Agent guide](AGENTS.md): repository rules and code map.
- [Design plans](plans/): design history; prefer current code and tests where
  plans describe an earlier implementation.
