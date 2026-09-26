# TypeSafe AI Texas Hold'em

A heads-up no-limit Texas Hold'em demo where TypeSafe System One proposes a
constrained action and the poker engine remains authoritative for every rule.

Repository: [github.com/jonime/ai-holdem](https://github.com/jonime/ai-holdem)

Public app: [ai-holdem.vercel.app](https://ai-holdem.vercel.app)

## What It Does

- Persists games, hands, actions, and AI decision audits in Supabase.
- Validates each human action against the authoritative engine.
- Lets TypeSafe and the deterministic offline Equity Rules bot act only
	through server-side validated choices.
- Shows legal actions, probability distributions, confidence, action history,
	and the winner.
- Keeps AI hole cards, TypeSafe input, raw responses, and private bot state
	confidential until the relevant hand completes.

This repo treats documentation as part of the implementation. If setup steps,
commands, env vars, or workflows change, update the docs in the same change.
This is a security-sensitive project: do not weaken validation, secret handling,
privacy boundaries, or version-checked mutation rules in the name of speed.

## Local Setup

Use Node.js 24 or newer and install dependencies from the lockfile.

```sh
npm ci
cp .env.example .env
```

Set these values in `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
TYPESAFE_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_BOT_PROFILES=[]
EXTERNAL_INFERENCE_ENABLED=true
```

`SUPABASE_SECRET_KEY`, `TYPESAFE_API_KEY`, and `OPENROUTER_API_KEY` are
server-only. Do not prefix them with `NEXT_PUBLIC_` and do not commit `.env`.
`EXTERNAL_INFERENCE_ENABLED` can be set to `false` in low-cost or offline
settings, while `OPENROUTER_BOT_PROFILES` is a JSON array of model definitions.

Game updates use Supabase Realtime Broadcast as a refetch signal. No additional
SQL migration is required for Broadcast. The demo intentionally uses public
game channels, so anyone who knows a game URL can subscribe; this is not an
authorization boundary for production. Broadcast is best-effort: a successful
database mutation remains successful when delivery is unavailable, and clients
always refetch authoritative HTTP state. Missing browser Supabase credentials
prevent the Realtime client from starting but do not expose server credentials.
Open tables also poll the authoritative game endpoint every 30 seconds while
Realtime is connected and every 5 seconds while it is unavailable. Polling
pauses in hidden or offline tabs, then refreshes immediately when the tab is
visible or online again.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor workflow and
checklist. Keep this README, [AGENTS.md](AGENTS.md), and [CONTRIBUTING.md](CONTRIBUTING.md)
kept in sync with the repo. If a workflow, command, setup step, or env variable
changes, update the docs in the same change.

Run every SQL file in [supabase/migrations](supabase/migrations) in filename
order using the Supabase SQL Editor, or let the GitHub integration below push
them for you. The migrations create RLS-protected tables and server-only RPCs
used for atomic version-checked game updates.

## Automatic Production Migrations

Migrations deploy via Supabase's native GitHub integration rather than a
custom CI workflow. One-time setup in the Supabase dashboard:

1. `supabase/config.toml` must exist and be committed (created once via
   `supabase init`; it holds local config only, not your project ref).
2. Project Settings -> Integrations -> GitHub -> Authorize GitHub -> connect
   this repository, and set the working directory to `.`.
3. Set `main` as the production branch and enable the **Deploy to
   production** option so pushes/merges to `main` apply new migrations.

After that, any push to `main` that adds files under `supabase/migrations/`
is applied to production automatically — no GitHub secrets or `supabase
link` required (that command only caches credentials locally in the
gitignored `supabase/.temp/`).

Preview/per-branch databases (Supabase Branching) were intentionally skipped
for this demo since it's a paid, per-branch-hour add-on; previews reuse the
same `.env` values configured in Vercel.

## Development

```sh
npm run dev
```

The development server defaults to http://localhost:3001.

Use the built-in offline bot catalog for deterministic play without external
inference: `Equity Rules` is the default non-LLM rules option, while
`TypeSafe Jev` and `OpenRouter` profiles remain available as provider-specific
choices.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## Translations

Every route is served under `/{locale}/` for ten supported locales. Dictionaries
live in `lib/i18n/dictionaries/` as `server-only` modules split by route group
(`metadata`, `landing-server`, `landing-client`, `game`). Server Components load
them directly through `lib/i18n/server`; client components receive either narrow
string props (landing page) or the game route's `I18nProvider`. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to add keys or locales.

## Agent and Search Discovery

The public homepage serves substantial server-rendered HTML to browsers and a
clean Markdown representation when the request prefers `text/markdown`. The
negotiated responses use `Vary: Accept`; unsupported homepage media types
receive `406 Not Acceptable`. Unknown pages keep a real `404` status and return
a Markdown error with a discovery link when Markdown is requested.

Public discovery resources are available at predictable URLs:

- `/llms.txt` — the spec-formatted agent map for the product and documentation.
- `/sitemap.xml` — localized homepage and developer-resource URLs.
- `/robots.txt` — crawler permission and sitemap location.
- `/{locale}/developers` — architecture, integration status, and source links.

Verify content negotiation and machine-readable files against a running app:

```sh
curl -sS -L -i -H 'Accept: text/markdown' http://localhost:3001/
curl -sS -L -i -H 'Accept: text/html' http://localhost:3001/
curl -sS -i -H 'Accept: text/markdown' http://localhost:3001/missing
curl -sS http://localhost:3001/llms.txt
curl -sS http://localhost:3001/sitemap.xml
curl -sS http://localhost:3001/robots.txt
```

### TypeSafe policy evaluation

Run the deterministic, cost-free policy benchmark with seeded deals and each
seat assignment:

```sh
npm run benchmark:policy
```

It compares the frozen v1 policy surrogate and the v2 exact-move policy
surrogate against `basic-equity-v1` plus scripted passive and aggressive
opponents. The JSON report includes big blinds won per 100 hands, a 95%
uncertainty interval, action frequencies, failures, and decision latency. This
is a regression harness for policy mechanics, not evidence that Jev plays
stronger poker.

Live Jev evaluation is deliberately separate from CI because it makes one paid
TypeSafe request per decision:

```sh
EXTERNAL_INFERENCE_ENABLED=true TYPESAFE_API_KEY=... npm run benchmark:typesafe:live
```

The live command uses seeded, seat-swapped deals and emits the same metrics.
Only statistically supported live comparisons should be used to claim stronger
play; passing unit tests or the mocked benchmark is insufficient.

### Local Supabase E2E

Start the local Supabase stack with `supabase start`, then run:

```sh
npm run test:e2e
```

The Playwright setup reads credentials from `supabase status`, starts Next on
an isolated port, and runs the browser flow against that local database. It
never uses the remote values from `.env`.

Use a clean local database when validating migration-dependent behavior:

```sh
npm run test:e2e:reset
```

## Deploy To Vercel

1. Import the existing Git repository in Vercel.
2. Keep the default Next.js build settings (`npm run build`).
3. Add the environment variables listed above for Production and Preview.
4. Deploy.

The application uses the Supabase Data API from Next.js server routes, so keep
the Supabase Data API enabled. The browser never receives the Supabase secret
or TypeSafe API key.

## Architecture

```text
browser -> Next.js API routes -> poker engine + TypeSafe -> Supabase
```

Each request applies at most one player action. Supabase RPCs atomically store
the resulting engine state, action record, and (for AI turns) the decision
audit while enforcing the expected game version.
