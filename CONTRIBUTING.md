# Contributing

This project is a small but security-sensitive demo. Contributions must follow the current code and docs, not assumptions from older notes or earlier designs.
Any change that weakens validation, privacy boundaries, migration safety, or version-checked mutation rules is not acceptable.

## Before you start

- Use Node.js 24 or newer.
- Install dependencies using `npm ci`, not a fresh lockfile drift.
- Copy `.env.example` to `.env` and fill in the required values before local testing.
- Keep Supabase migrations in order, and never edit an already-applied migration.

## Required workflow

1. Create a focused branch for the change.
2. Keep the scope narrow and reviewable.
3. Match the current architecture and project rules in the codebase.
4. Update the relevant docs when a rule, command, env var, setup step, or workflow changes.
5. Validate with the required checks before opening or updating a PR.
6. If a change affects project policy, security-sensitive behavior, or setup, include the matching doc update in the same PR.

## Required checks

Run:

```sh
npm run check
```

This includes ESLint, strict TypeScript checking, and the Vitest suite.

For routing, rendering, deployment-facing, or environment-sensitive changes, also run:

```sh
npm run build
```

## Documentation standards

Docs are part of the implementation.

- Keep [AGENTS.md](AGENTS.md), [README.md](README.md), and this file aligned with the live codebase.
- When a repo rule, setup step, env variable, command, or workflow changes, update the relevant docs in the same change.
- Do not leave stale instructions behind; stale guidance is a product bug.

## Architecture and security rules

- Keep third-party poker-engine details behind `lib/poker/adapter.ts`.
- Let the authoritative engine decide legality; validate proposed human actions before persisting them.
- Preserve optimistic-concurrency checks and expected version validation in the service and API layers.
- Keep secrets server-only. Do not add `NEXT_PUBLIC_` prefixes or import server code into client components.
- Do not expose private hole cards, player tokens, raw TypeSafe inputs, or private responses in public DTOs.
- Keep database mutations atomic and scoped to at most one action per request.

## Pull requests

- Keep PRs small, focused, and easy to review.
- Include tests for behavior changes and bug fixes, especially for stale, illegal, unauthorized, or privacy-sensitive paths.
- Call out migrations, env changes, or deployment implications explicitly in the PR description.
- State which verification commands you ran and their result.
- If the change affects docs, include the doc update in the same PR.

## Questions

If a project rule or workflow is unclear, prefer the current code and project docs over older notes, assumptions, or stale examples.
