## Plan: Correctness And Resilience Hardening

The project has a strong service/repository split, but several untrusted-data boundaries still rely on unchecked casts or incomplete runtime validation. The recommended improvement is a phased hardening pass using Zod: start at the browser/API boundary, then secure AI and persisted-state parsing, then cover realtime and route error paths with focused tests. Keep the existing Postgres-as-source-of-truth and best-effort-Realtime architecture.

**Steps**

### Phase 1: Establish Runtime Validation At The Client Boundary

1. Install Zod as a runtime dependency and extend `requestJson` in `lib/http/request-json.ts` to accept a Zod schema rather than pretending a generic `T` is validated. Preserve existing HTTP error extraction, but distinguish invalid JSON and invalid successful payloads with a user-safe error.
2. Add focused Zod schemas for the response DTOs actually consumed by the browser: game responses, game creation, hand history, seat actions, and AI-step responses. Keep schemas shallow where the server DTO is already authoritative; validate required discriminators and version/id fields instead of duplicating the entire poker engine schema.
3. Migrate `components/poker/useGameSession.ts` so both direct `fetch(...).json()` paths use the same parsing boundary as mutation calls. Invalid game/history payloads should enter the existing error state and must not update React state.
4. Add unit tests for valid payloads, malformed JSON, missing required fields, wrong version types, and non-OK responses. This phase is independently verifiable and blocks client-side follow-up work.

### Phase 2: Harden AI, Persistence, And Route Inputs

5. In `lib/typesafe/decision.ts`, validate the selected action and sizing choice against the legal actions supplied to the decision function before constructing a poker action. Reject unknown probability keys and impossible sizing choices with the existing `TypesafeResponseError` path, and add focused tests for malformed and semantically invalid TypeSafe responses.
6. In `lib/poker/game-service.ts`, introduce one checked restore boundary for persisted `currentState` and use it from human action, AI action, and next-hand flows. Preserve engine-specific validation as the authority; convert malformed persisted state into a deliberate domain/service error rather than allowing an unchecked assertion to leak through.
7. Replace route-local object assertions with a shared `isRecord`-style narrowing helper where applicable, especially action, start, settings, seat-count, and seat routes. Keep request validation at the HTTP boundary and leave orchestration in `game-service`.
8. Update the history endpoint to validate the requested hand against the game’s known progress while keeping history publicly readable for anonymous spectators. Use a public history schema/projection so the endpoint exposes the intended history data without requiring a seat token; add tests for invalid, out-of-range, and anonymous requests.

### Phase 3: Make Realtime Input Defensive Without Changing Its Reliability Model

9. In `lib/realtime/useGameChannel.ts`, parse broadcast envelopes defensively: require a recognized event type and a finite safe-integer version for versioned game events, and ignore malformed payloads without invoking a refetch. Preserve seat-event behavior and the existing stale-version filter.
10. Add unit-level tests around the event handler behavior: newer event triggers refetch, stale event is ignored, malformed version/type does nothing, and seat events still refresh. Do not make a successful database mutation depend on Broadcast delivery; Realtime remains a best-effort wake-up signal and manual/API refresh remains authoritative.
11. Review `lib/realtime/publish.ts` and route tests for observability only. Keep publish failures non-fatal unless verification shows a concrete contract requiring propagation; avoid coupling persistence success to an external notification.

### Phase 4: Close The Highest-Value Route Test Gaps

12. Add focused route tests for action, step, history, start, and seat mutations. Cover malformed bodies, invalid enums/actions, missing or stale versions, authorization/host failures, domain errors, response masking, and the selected history privacy behavior.
13. Use existing route test mocking patterns from `app/api/games/[gameId]/route.test.ts` and `app/api/games/[gameId]/settings/route.test.ts`. Keep database and TypeSafe services mocked; tests must remain independent of live Supabase or TypeSafe.
14. After each phase, run the narrow tests for the touched slice, then run the project checks with the repository’s known exclusions for generated `.next-e2e` lint output and Playwright files accidentally picked up by Vitest.

**Relevant files**

- `/Users/joni/Workspace/ai-holdem/lib/http/request-json.ts` — add the parser boundary and consistent malformed-response errors.
- `/Users/joni/Workspace/ai-holdem/lib/http/schemas.ts` — define shared Zod schemas for browser-facing response DTOs and reusable primitive schemas.
- `/Users/joni/Workspace/ai-holdem/components/poker/useGameSession.ts` — remove direct response casts and route all browser payloads through validators.
- `/Users/joni/Workspace/ai-holdem/components/poker/types.ts` — reuse existing public DTO types when defining guards; do not introduce duplicate domain models.
- `/Users/joni/Workspace/ai-holdem/lib/typesafe/decision.ts` and `lib/typesafe/decision.test.ts` — validate AI output semantics against legal actions.
- `/Users/joni/Workspace/ai-holdem/lib/typesafe/client.ts` — preserve the raw external response boundary and ensure malformed upstream bodies take the existing typed error path where needed.
- `/Users/joni/Workspace/ai-holdem/lib/poker/game-service.ts` and `lib/poker/game-service.test.ts` — centralize checked persisted-state restoration.
- `/Users/joni/Workspace/ai-holdem/app/api/games/[gameId]/history/route.ts` — enforce hand bounds and preserve the public history projection.
- `/Users/joni/Workspace/ai-holdem/lib/realtime/useGameChannel.ts` — validate event envelopes and retain stale-event filtering.
- `/Users/joni/Workspace/ai-holdem/app/api/games/[gameId]/action/route.ts`, `step/route.ts`, `start/route.ts`, `settings/route.ts`, `seat-count/route.ts`, and `seats/**/route.ts` — narrow request bodies and add error-path coverage.
- `/Users/joni/Workspace/ai-holdem/app/api/games/[gameId]/route.test.ts` and `settings/route.test.ts` — follow established route mocking and response assertions.

**Verification**

1. Phase 1: run targeted Vitest tests for the request parser and `useGameSession` response handling, then run ESLint and TypeScript on the touched files.
2. Phase 2: run `npx vitest run lib/typesafe/decision.test.ts lib/poker/game-service.test.ts` and route tests for history/request parsing.
3. Phase 3: run focused Realtime hook tests plus the existing client/view-model tests; manually verify that a missing Realtime channel still leaves GET/manual refresh usable.
4. Phase 4: run the new route suites with `npx vitest run --exclude 'test/e2e/**'`, then `npm run typecheck` and a source-only lint invocation excluding `.next-e2e/**`.
5. Run `npm run build` after the client/API contract changes because they affect Next.js rendering and browser/server boundaries.
6. Before implementation is considered complete, run the full documented `npm run check` and record the known pre-existing generated-artifact/configuration failures separately if they remain.

**Decisions**

- Use Zod as the shared runtime validation dependency. Schemas keep the generic helper honest, produce useful validation errors, and avoid duplicating ad hoc guards across browser, route, AI, persistence, and Realtime boundaries.
- Treat malformed external data as a controlled error, never as an empty successful payload.
- Keep Realtime advisory. Database writes and HTTP responses remain authoritative, and Broadcast failures must not roll back a successful mutation.
- History policy: history remains publicly readable so anonymous spectators can use it. The endpoint should still return the intentional public history DTO and avoid unrelated private data; active hole-card masking remains governed by existing viewer-token projection rules.
- Scope includes correctness, public history DTO validation, and regression tests. It excludes redesigning authentication, replacing Supabase, or implementing retry/compensation for database transactions.

**Further Considerations**

1. The exact public history fields should be confirmed against the current UI before implementation; anonymous users must continue to receive the supported public history view without a seat token.
2. The full audit identified additional lower-priority concerns such as standardized error codes and concurrent browser mutation tests; keep them as follow-up work unless a failing test demonstrates they are required for these phases.
