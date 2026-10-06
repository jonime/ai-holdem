# Anonymous fair-use admission

OpenRouter's spending cap remains the financial safeguard. Application pacing is
provisional fairness protection, with no global application budget or sign-in.
It cannot establish human identity: cookie replacement, multiple IPs, and many
legitimate visitors remain possible. Verified accounts are a separate future option.

`lib/usage/policy.ts` owns the defaults: 600 external attempts per durable table
host per rolling hour, 30 per game per rolling minute, 6 creation attempts per
owner per rolling 10 minutes, and 30 creation attempts per IP per rolling 10
minutes. TypeSafe and LLM attempts count; deterministic rules turns do not.
Quick Play, localized custom forms, custom JSON creation, replay, and rules-only
creation share the creation counters. Denied attempts consume nothing; admitted
attempts count even when persistence/provider calls fail or a process crashes.
No ambiguous paid attempt is refunded.

Deploy `20261016000000_add_usage_admission.sql` and a server-only
`USAGE_LIMIT_HASH_SECRET` with at least 32 random bytes before the application.
Generate a secret with `openssl rand -hex 32`; never prefix it with `NEXT_PUBLIC_`,
log it, or commit it. Keep it stable across instances; rotating it resets hashed
allowances. Existing games keep their durable host record. Missing owners block
external inference. Supabase admission failures fail closed for external calls
and creation, while existing rules turns keep working.

Service-role-only RPCs use database time, exact rolling windows, and consistently
ordered key locks. Admission checks the game version and matching unexpired claim
after authorization, turn validation, claim acquisition, and context preparation.
The claim's admission marker makes repeated admission idempotent. Admission
failures release the claim through existing cleanup; they never apply actions,
retire bots, change versions, or schedule success notifications. Reservations
survive provider failures. Per-key histories are bounded by policy allowances;
admission prunes expired entries and removes at most 100 indexed inactive keys
older than 24 hours. No scheduler is needed.

Limiter records contain domain-separated HMACs of host tokens and normalized IPs,
and opaque game IDs, never raw tokens or IPs. Production creation on Vercel uses
only `x-vercel-forwarded-for`, relying on [Vercel's platform-controlled request
header handling](https://vercel.com/docs/headers/request-headers). Another proxy
requires separate verification. A missing or invalid platform IP returns safe
503 unavailability. Non-Vercel development injects loopback server-side; isolated
local production tests explicitly inject `USAGE_LIMIT_TEST_IP` and generate a
fresh test secret. Incoming forwarding headers are never trusted locally. This
test variable is not a production proxy configuration.

Denials return 429, `Retry-After`, and `OWNER_AI_LIMIT`, `GAME_AI_RATE_LIMIT`, or
`GAME_CREATION_LIMIT` with `retryAfterMs`. Multiple blocked keys select the longest
wait. The shared error contract permits one hour; `BOT_STEP_IN_PROGRESS` retains
its separate 90-second bound. Normal form denials render localized HTML with
retry guidance and a home link. JSON callers receive the typed envelope.

The existing table stays open. External advancement pauses for the denied
version; polling and countdown completion do not trigger inference. Explicit
retry becomes available after expiry and refetches authoritative state. An
advanced version clears the obsolete notice. “Start a rules-only game” uses
`POST /{lang}/quick-game?botMode=rules`, creates a distinct private six-seat table
with five rules bots, preserves identity cookies, and protects pending requests.
Omitting `botMode` retains mixed selection; `EXTERNAL_INFERENCE_ENABLED=false`
still enforces rules selection. Creation limits apply to both modes.

Run `npm run check`, `npm run build`, `npm run test:sql:usage`, and
`npm run test:e2e:smoke`. The SQL runner preserves local data, cleans up isolated
fixtures, and tests concurrent owner/game/IP limits, claim idempotency, expiry,
independent owners, roles, and bounded cleanup. Unit tests cover HMAC/IP handling,
storage failures, typed waits, creation routes, rules exemption, and provider
failure admission. Production browser smoke covers both countdown codes, explicit
retry, retained state, rules replay/navigation, and shared HTML/JSON denials.
Run `npm run test:e2e:smoke -- --grep fair-use` for the additional authoritative-advance and creation-countdown cases. CI runs the SQL runner before production smoke. Logs contain only aggregate
denial categories; claim cleanup may log the existing safe game identifier.
