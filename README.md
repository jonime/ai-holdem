# TypeSafe AI Texas Hold'em

A heads-up no-limit Texas Hold'em demo where TypeSafe System One proposes a
constrained action and the poker engine remains authoritative for every rule.

Repository: [github.com/jonime/ai-holdem](https://github.com/jonime/ai-holdem)

## What It Does

- Persists games, hands, actions, and TypeSafe decision audits in Supabase.
- Validates each human action against the authoritative engine.
- Lets TypeSafe act only through server-side, validated System One Choices.
- Shows legal actions, probability distributions, confidence, action history,
	and the winner.
- Keeps AI hole cards, TypeSafe input, and raw responses private until the
	relevant hand completes.

## Local Setup

Use Node.js 24 or newer and npm.

```sh
npm install
cp .env.example .env
```

Set these values in `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
TYPESAFE_API_KEY=
```

`SUPABASE_SECRET_KEY` and `TYPESAFE_API_KEY` are server-only. Do not prefix
them with `NEXT_PUBLIC_` and do not commit `.env`.

Game updates use Supabase Realtime Broadcast as a refetch signal. No additional
SQL migration is required for Broadcast. The demo intentionally uses public
game channels, so anyone who knows a game URL can subscribe; this is not an
authorization boundary for production. Broadcast is best-effort: a successful
database mutation remains successful when delivery is unavailable, and clients
always refetch authoritative HTTP state. Missing browser Supabase credentials
prevent the Realtime client from starting but do not expose server credentials.

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

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

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
3. Add the four environment variables above for Production and Preview.
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