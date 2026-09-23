## Plan: Supabase Realtime Reliability

Supabase Broadcast is already integrated as a best-effort wake-up signal: mutation routes publish sanitized events after successful writes, the browser subscribes to `game:<gameId>`, and clients refetch authoritative HTTP state. The next improvement should make that transport observable, lifecycle-safe, and testable without making Broadcast authoritative, blocking successful mutations, or changing the demo's intentional public-channel access model.

**Steps**

### Phase 1: Define One Validated Realtime Contract

1. Add a Zod schema module for Realtime envelopes, building on the Zod dependency and response-schema work already present in `lib/http/schemas.ts`. Define the supported event names, the common `{ type, gameId, version }` envelope, and the allowed payload combinations for game, AI decision, and seat events.
2. Make the event contract explicit about masking: broadcast game payloads must have `legalActions: []`, `playerToken: null`, and `holeCards: null` for every player. Do not reuse viewer-specific HTTP projections as broadcast payloads.
3. Validate `gameId` against the subscribed game in the client, require a finite safe-integer version for versioned events, and reject unknown event names or malformed payloads before they can trigger a refetch.
4. Use the same schema in `lib/realtime/publish.ts` before sending, so server code cannot accidentally publish private data or an invalid event envelope. Add unit tests for every event family, masking, unknown event names, wrong versions, wrong game IDs, and malformed payloads.

### Phase 2: Make Server Publishing Observable But Non-Blocking

5. Refactor `publishGameEvent` to return a small result such as `{ ok: true } | { ok: false; error }` while continuing to catch/log failures. Preserve the current fire-and-forget route behavior: a committed database mutation still returns success even if Broadcast is unavailable.
6. Ensure every successful mutating route publishes exactly once after persistence succeeds: human action, AI step, hand transition, start, table settings, seat-count changes, seat claim, seat release, and bot assignment. Confirm event names and versions match the committed response.
7. Keep server cleanup deterministic: create the server client/channel, send one event, remove the channel in `finally`, and prevent cleanup errors from masking the original outcome. Avoid introducing a global client pool until measurement shows channel creation is a real bottleneck.
8. Add publish-helper tests with mocked Supabase clients for successful sends, non-`ok` send results, thrown errors, cleanup, and sanitized payloads. Add route assertions that publishing happens after the service resolves and is not attempted after a failed mutation.

### Phase 3: Harden Client Subscription Lifecycle

9. Update `lib/realtime/useGameChannel.ts` to expose or internally track subscription status (`connecting`, `subscribed`, `error`, `closed`) and clean up exactly the channel created for the current game. Do not call the browser client again during cleanup if the original client instance can remove the channel directly.
10. Handle Supabase statuses explicitly: log or report `CHANNEL_ERROR`, `TIMED_OUT`, and `CLOSED`; treat `SUBSCRIBED` as readiness; and avoid declaring the channel healthy before that callback. Subscription failure must leave the normal GET/manual-refresh path usable.
11. Keep the current version filter, but validate the complete envelope before comparing versions. Seat events should still refresh even though they may not carry a game version in the same way; all other supported events need a newer version than the current client state.
12. Add a small refetch coordinator in `useGameSession` or the hook boundary to coalesce bursts of events into one GET request per short window, while preserving cancellation and preventing an older event-triggered response from overwriting newer state. Realtime should wake the client, not apply payload patches.
13. Route event-triggered load failures into the existing error/recovery path or a non-blocking stale-state indicator. Do not silently discard fetch failures, but do not replace a usable last-known game state with an error-only screen because a notification was missed.

### Phase 4: Verify Public-Channel Configuration And Privacy

14. Keep the demo's public channel model: anyone who knows a game URL may subscribe, and no new private-channel RLS migration is required. Document this as intentional demo behavior and explicitly state that Broadcast is not an authorization boundary.
15. Verify that only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` reach the browser, while `SUPABASE_SECRET_KEY` remains server-only. Add a configuration test or documented startup failure for missing browser credentials.
16. Review every broadcast payload against the public DTO boundary. Never include hole cards, player tokens, legal actions, TypeSafe input, raw TypeSafe response, or private AI state. Keep public completed-hand history access separate from Broadcast payload design; history remains served anonymously through HTTP.

### Phase 5: Add Focused Integration And Browser Coverage

17. Add unit tests for envelope parsing and the hook's event decisions: newer event refetches, stale event is ignored, malformed event is ignored, wrong game ID is ignored, seat events refresh, and channel cleanup runs on unmount/game change.
18. Add publish tests and route tests for all mutation families using existing Vitest mocks. Cover one publish per successful write, no publish on validation/service failure, masked payloads, and version consistency.
19. Extend Playwright coverage with a two-page synchronization scenario that performs a real action and verifies the other page converges without reload. Add degraded-path coverage by blocking or mocking Realtime while confirming HTTP mutations and manual reload still work.
20. Avoid destructive global Supabase resets during manual browser checks unless running the isolated E2E setup described in `AGENTS.md`; use a separate local test database or a newly created demo game.

**Relevant files**

- `/Users/joni/Workspace/ai-holdem/lib/realtime/publish.ts` — envelope validation, masking enforcement, result reporting, cleanup, and publish tests.
- `/Users/joni/Workspace/ai-holdem/lib/realtime/useGameChannel.ts` — schema validation, subscription lifecycle, status handling, stale-version filtering, and cleanup tests.
- `/Users/joni/Workspace/ai-holdem/lib/realtime/client.ts` — browser-safe Supabase client configuration and missing-credential behavior.
- `/Users/joni/Workspace/ai-holdem/lib/http/schemas.ts` — extend the existing Zod schema conventions with shared Realtime event schemas if that keeps the boundary cohesive.
- `/Users/joni/Workspace/ai-holdem/components/poker/useGameSession.ts` — event-triggered refetch coalescing, cancellation, and error handling.
- `/Users/joni/Workspace/ai-holdem/app/api/games/[gameId]/action/route.ts`, `step/route.ts`, `next-hand/route.ts`, `start/route.ts`, `settings/route.ts`, `seat-count/route.ts`, and `seats/**/route.ts` — verify complete post-write event coverage.
- `/Users/joni/Workspace/ai-holdem/test/e2e/lobby.spec.ts` and a new Realtime-focused Playwright spec — cross-page synchronization and degraded-path verification.
- `/Users/joni/Workspace/ai-holdem/README.md` and `AGENTS.md` — document public-channel scope, best-effort semantics, and validation/testing commands.
- `/Users/joni/Workspace/ai-holdem/supabase/migrations/` — deliberately unchanged unless the product later chooses authenticated private channels.

**Verification**

1. Run focused Realtime and schema unit tests after Phase 1: `npx vitest run lib/realtime lib/http --exclude 'test/e2e/**'`.
2. Run route tests and publish tests after Phase 2, checking that all successful writes publish once and failed writes publish zero times.
3. Run focused client/view-model tests and a source-only ESLint/typecheck for `lib/realtime`, `lib/http`, `components/poker/useGameSession.ts`, and touched routes.
4. Run the Realtime Playwright scenario against the isolated local Supabase setup, verifying two pages converge without reload and that an unavailable channel does not break HTTP flows.
5. Run `npm run build` because browser/server environment handling and client hooks are affected.
6. Run the repository's documented checks, recording the known `.next-e2e` lint and Vitest/Playwright discovery issues separately if they remain.

**Decisions**

- Postgres and the poker engine remain authoritative. Broadcast only announces that a newer state may exist; clients refetch through HTTP.
- Broadcast delivery is best-effort and non-blocking. A publish failure is observable in logs/results but never turns a committed mutation into an HTTP failure.
- Public channels remain intentional for this anonymous URL-based demo. No private-channel RLS migration is included in this plan.
- Zod is the validation mechanism for event envelopes and payload boundaries, matching the validation work already underway elsewhere in the project.
- No optimistic client patching, Presence, viewer counts, polling redesign, or database transaction compensation is included.

**Further Considerations**

1. Decide whether subscription status should be exposed in the UI. Recommendation: keep it as internal diagnostics initially and add visible status only if users need to understand delayed updates.
2. Use debounce/coalescing conservatively; a short event burst should produce one refetch, but a later version must still trigger another fetch after the first request completes.
3. Treat public-channel access as acceptable only for the demo. A production authentication/private-channel plan should be separate because it changes identity, RLS, and deployment assumptions.
