<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI Hold'em Project Guide

## Purpose

This is a TypeScript demo of heads-up no-limit Texas Hold'em. Humans and
TypeSafe AI occupy seats, while `@hivetech/poker-engine` remains authoritative
for cards, turns, legal actions, betting, pots, and winners. Supabase persists
game state and version-checked mutations; Realtime Broadcast only tells clients
to refetch authoritative state.

The files in `plans/` explain the design sequence and security decisions. Use
them for context, but treat the current code and tests as the source of truth
when a plan describes an earlier state.

## Setup

- Use Node.js 24 or newer. The repository includes `.nvmrc` for Node 24.
- Install exactly from the lockfile with `npm ci` (use `npm install` only when
	intentionally changing dependencies).
- Copy `.env.example` to `.env` and provide the four documented values.
- Apply every file in `supabase/migrations/` in filename order to a Supabase
	project. Never edit an already-applied migration; add a new timestamped one.
- Start the app with `npm run dev`; it listens on `http://localhost:3001`.

## Required Checks

Run `npm run check` after code changes. It runs ESLint, the strict TypeScript
check, and the Vitest suite. Run `npm run build` for changes affecting Next.js
routing, rendering, environment handling, or deployment behavior.

Pull requests and pushes to `main` run both commands in `.github/workflows/ci.yml`
using non-secret placeholder environment values. Tests must not depend on live
Supabase or TypeSafe services.

## Architecture Rules

- Keep third-party poker-engine details behind `lib/poker/adapter.ts`. Inspect
	the installed package declarations and behavior before using an engine API.
- The poker engine, never TypeSafe output or client input, decides legality.
	Validate a proposed action, apply it through the adapter, then persist it.
- Each mutation applies at most one action and uses the expected game version.
	Preserve optimistic-concurrency conflict handling in service and API layers.
- Postgres is the source of truth. Realtime events are best-effort wake-up
	signals; clients refetch and must continue to work if Broadcast is unavailable.
- Public DTOs are a security boundary. Reveal active hole cards only to the
	browser that owns that seat. Do not broadcast private cards, player tokens,
	TypeSafe inputs, or raw responses.
- Keep `SUPABASE_SECRET_KEY` and `TYPESAFE_API_KEY` server-only. Never add a
	`NEXT_PUBLIC_` prefix or import server modules into client components.
- Anonymous player tokens support this demo's seat ownership; they are not
	production authentication. Knowing a game URL intentionally permits viewing.

## Code Map

- `app/api/games/`: HTTP boundary for game creation, actions, seats, history,
	AI stepping, and hand transitions.
- `lib/poker/`: domain types, engine adapter, public projections, and game
	orchestration.
- `lib/supabase/`: persistence parsing and repository implementation.
- `lib/typesafe/`: System One HTTP client and constrained decision validation.
- `lib/realtime/`: server publishing and client refetch subscriptions.
- `components/poker/`: client game, lobby, and spectator experience.
- `supabase/migrations/`: ordered schema and atomic RPC changes.

## Change Guidance

- Put orchestration and validation in services, not route handlers or React
	components. Routes should parse input, call the service, and map known errors.
- Parse persisted and external data defensively. Do not replace runtime checks
	with unchecked TypeScript assertions.
- Add focused tests beside the owning module. Cover rejected stale, illegal,
	unauthorized, or privacy-sensitive paths as well as successful behavior.
- Keep UI assumptions based on seat/controller data rather than hardcoding
	seat 0 as the human or seat 1 as the AI.
- Preserve secret masking before changing API responses, history, spectator
	views, or Realtime payloads.
