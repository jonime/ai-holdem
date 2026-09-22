# TypeSafe AI Texas Hold'em

A heads-up no-limit Texas Hold'em demo where TypeSafe System One proposes a
constrained action and the poker engine remains authoritative for every rule.

## What It Does

- Persists games, hands, actions, and TypeSafe decision audits in Supabase.
- Validates each human action against the authoritative engine.
- Lets TypeSafe act only through server-side, validated System One Choices.
- Shows legal actions, probability distributions, confidence, action history,
	and the winner.
- Keeps AI hole cards, TypeSafe input, and raw responses private until the
	relevant hand completes.

## Local Setup

Use Node.js 22 or newer and npm.

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

Run every SQL file in [supabase/migrations](supabase/migrations) in filename
order using the Supabase SQL Editor. The migrations create RLS-protected tables
and server-only RPCs used for atomic version-checked game updates.

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