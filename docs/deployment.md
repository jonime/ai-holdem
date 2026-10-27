# Deployment

## Vercel

1. Import the existing Git repository in Vercel.
2. Keep the default Next.js build settings (`npm run build`).
3. Add the environment variables in [`.env.example`](../.env.example) for
   Production and Preview.
4. Apply all required database migrations, then deploy.

The application uses the Supabase Data API from Next.js server routes, so keep
the Supabase Data API enabled. The browser never receives the Supabase secret
or any provider API key.

Feedback diagnostics need no migration or external service. At build time,
`next.config.ts` accepts only a full hexadecimal `VERCEL_GIT_COMMIT_SHA` as the
public diagnostic build identifier; missing/invalid values become `local/unknown`.
Do not set `APP_BUILD_IDENTIFIER` yourself or expose deployment URLs. Search an
explicitly supplied error reference in Vercel runtime logs as the exact
`requestReference` on `application_request_failed`; a missing reference cannot be
correlated with a server event. See [safe application diagnostics](../CONTRIBUTING.md#safe-application-diagnostics).

## Shared replay rollout

Apply `20261031000000_add_replay_shares.sql` and the additive
`20261101000000_add_owner_share_management.sql` before application deployment; no
backfill. Use pinned CLI 2.120.0 to regenerate/check types against the migrated
local schema. The existing server-only `USAGE_LIMIT_HASH_SECRET` and trusted
Vercel IP assumptions also govern separate share admission. Run `check`, `build`,
`test:sql:replay`, `test:sql:shares` and the isolated production replay/share UI
suites, including `play-tabs.spec.ts`, `play.spec.ts`, `public-lobby.spec.ts`,
`table-removal.spec.ts` and `settings.spec.ts`. CI includes the share SQL lifecycle suite.
The new migration adds only an owner/ordering index and service-role list/exact-revoke
RPCs; existing share visibility, admission, expiry and deletion cascades stay unchanged.

Treat viewing URLs as bearer credentials. Application logs must never contain
share URLs/tokens, snapshots or ownership credentials. Shared pages disable Speed
Insights and use `Referrer-Policy: no-referrer`; sitemap entries must never include
shares. Before release, inspect hosting/CDN/proxy URL and access-log retention,
log drains, error trackers and analytics: disable request-path collection for
`/replay/*`, localized equivalents and `/api/replays/*`, or redact token segments
before export. Platform access logs may retain request URLs outside application
control; restrict access and retention, document the effective provider settings,
and do not promise that revocation removes previously downloaded copies or logs.
Verify private/no-store and no-referrer on deployed HTML and JSON, including errors.
Deletion cascades and database-time expiry remain effective if the owner loses
the anonymous cookie. Losing the cookie prevents further management.

## Personal results rollout

Apply additive `20261102000000_add_personal_results.sql` before application deployment.
It adds only a service-role history RPC; no backfill, background job, public grant,
provider setting or persistent summary cache is needed. Legacy missing states,
ownership or pre-blind metadata remain visibly unavailable.

Regenerate and verify database types with pinned Supabase CLI 2.120.0 against the
fully migrated local schema. Run `test:sql:results`, focused results tests, `check`,
benchmark regressions when shared dependencies change, and the production personal-results browser
suite/build. CI includes results SQL and the tagged Chromium UI coverage. Check
private no-store headers, browser identity separation, replay/back focus, historical
BB totals, incomplete coverage and mobile layout. Apply no database reset.

## Completed-hand replay rollout

Apply `20261030000000_add_hand_replay.sql` before deploying the replay route. It adds
only `get_hand_replay`, restricted to `service_role`; no backfill or provider settings
are needed. Older hands are reviewable only when their stored snapshots and actions
pass strict reconstruction. Apply all migrations locally, then regenerate/check
`database.generated.ts` with pinned Supabase CLI 2.120.0.

Run `test:sql:replay`, `check`, `build` and the relevant production UI suites
(`hand-replay`, `hand-results-actions`, `dialogs`, `settings`). Verify a completed
hand from both entry points and a live timed turn arriving during review. No
notification publishing lifecycle changes are introduced.

## Bot-step duration release check

`app/api/games/[gameId]/step/route.ts` exports `maxDuration = 90`, leaving
30 seconds around the shared 60-second provider deadline for authorization,
context reads, persistence, projection, and notification cleanup. Vercel consumes
this route configuration from the build output; see its
[function duration documentation](https://vercel.com/docs/functions/configuring-functions/duration).

Before releasing a deployment containing this change, inspect its bot-step
function configuration in Vercel and confirm the **effective duration is at least
90 seconds**. Record the deployment URL/commit and observed duration in the
release evidence. If the project/plan or legacy compute setting caps execution
below 90 seconds, enable a supported compute setting (such as Fluid Compute),
adjust the permitted function duration, and redeploy before release. A 60-second
platform limit is insufficient for a useful localized timeout response.

Local unit/browser tests and `.next/server/functions-config-manifest.json` can
verify the requested duration, but cannot prove Vercel's deployed effective limit
or timeout behavior. No deployed configuration has been verified as part of the
local implementation; this release check remains required.

## Speed Insights

The locale root layout includes `@vercel/speed-insights/next` to measure Web
Vitals across the application's pages. Enable **Speed Insights** in the Vercel
project dashboard before deploying this integration, then visit the deployed
site and check the Speed Insights dashboard. No additional application
environment variables or database migrations are needed.

Performance events remove query strings and fragments, replace table IDs with
`[gameId]`, and report only known page shapes. Debug logging is disabled. Keep
this filtering in `lib/observability/performance.ts` when adding routes or
changing telemetry. See Vercel's [privacy documentation](https://vercel.com/docs/speed-insights/privacy-policy)
for the performance data it collects. Web Analytics is not enabled by this
integration.

## Personal summary rollout

Apply `20261026000000_add_personal_summary_composition.sql` before the matching
application code. It drops and recreates the service-role-only `list_my_games(text)`
RPC with human/bot counts and caller seat ownership; it does not change stored rows.
Coordinate the application rollout because the old return signature is replaced.
Run `test:sql:my-games`, `test:sql:removal` and `test:e2e:ci` against the migrated
local stack. Personal responses remain private/no-store and excluded from logs,
shared caches and Realtime.

## Eevo rollout

Apply `20261029000000_add_eevo_bot.sql` before the application. It extends provider
and difficulty constraints without changing Jev seats/history or adding tables.
Generate/check database types with pinned CLI 2.119.0 against the fully migrated
local schema. Deploy the code with Eevo unavailable, wait until old instances that
reject `eevo` provider values drain, then configure the server-only `EEVO_API_KEY`.
Keep `EEVO_QUICK_PLAY_ENABLED=false` for the initial custom-table trial; enabling
it later adds configured Eevo to Quick Play. No endpoint/model settings are used.
`EXTERNAL_INFERENCE_ENABLED=false` disables Eevo requests and new selections too.
Existing seats still parse after credentials are removed, and failures pause visibly.
Verify the effective 90-second bot-step duration and the authorized Vercel lifecycle
smoke before release. This local implementation does not deploy or call providers.

## Migration prerequisites

Apply every SQL file in [supabase/migrations](../supabase/migrations) in filename
order before deploying application code that depends on it. Never edit an
already-applied migration; add a new timestamped file. The migrations create
RLS-protected tables and server-only RPCs for atomic version-checked updates.

`20261008000000_add_public_game_directory.sql` adds the private-by-default
listing table, host leases, directory RPCs, and atomic seat mutation RPCs. Apply
it, `20261008000100_classify_unavailable_directory_joins.sql`, and
`20261008000200_add_public_game_exclusions.sql` before deploying the matching
application code. The last of those directory migrations adds the server-only, lightweight viewer
exclusion query used with the shared directory cache. They need no backfill or
cleanup scheduler.

`20261010000000_add_action_seat_to_game_feed.sql` adds action seats for identity
resolution against immutable initial hand configurations. It preserves feed
limits, ordering, server-only snapshots, and grants. No backfill is required;
legacy rows without usable identities return null player IDs.

`20261011000000_add_incremental_game_feed.sql` adds the service-role-only
`get_game_feed_since` RPC. The full-feed RPC remains available; no backfill is
required. Verify filtering, ordering, bounds, and grants against migrated local
Supabase with:

```sh
docker exec -i supabase_db_ai-holdem psql -U postgres -d postgres -v ON_ERROR_STOP=1 < test/sql/incremental-game-feed.sql
```

The verification fixtures are rolled back.

`20261012000000_add_game_read_snapshot.sql` adds the server-only game snapshot
RPC. Apply it before deploying code that uses the snapshot reader. It is additive
and requires no game backfill. See the [game-state read checks](../CONTRIBUTING.md#game-state-read-checks)
for local SQL, benchmark, and browser verification.

Broadcast requires no additional SQL migration. Server publication uses
`channel.httpSend()`, which requires Realtime server v2.97.0 or newer. Ensure
local and self-hosted stacks meet this prerequisite before deploying.
Realtime lifecycle changes also
require the [deployed two-browser smoke test](../CONTRIBUTING.md#realtime-lifecycle-changes).

`20261015000000_add_bot_step_claims.sql` adds the service-role-only claim table,
90-second acquisition/release RPCs and ordinary/credit-departure commit wrappers.
Apply it after all earlier migrations and before deploying claim-aware code.
Drain old application instances before relying on inference deduplication: older
instances can still call the unfenced mutation RPCs. Claims require no backfill,
scheduler or lease renewal. Verify with `npm run test:sql:bot-claims` and
`npm run test:e2e:smoke -- --grep claim`. Expired leases permit crash recovery but
do not guarantee exactly-once provider billing.

`20261014000000_add_atomic_bot_credit_departure.sql` adds the service-role-only
`apply_ai_action_and_leave_if_version` RPC. Apply it before deploying the LLM
credit fallback. It atomically commits a legal fold and marks the bot leaving;
the existing next-hand reconciliation removes the seat. No backfill is required.
`npm run test:sql:seats` includes isolated rollback, conflict, and role checks for
this RPC. See [provider failure behavior](architecture.md) for credit detection
and Vercel log search terms, including Jev HTTP failures.

## Fair-use rollout

Before deploying fair-use application code, apply
`20261016000000_add_usage_admission.sql` after the claim migration and configure
`USAGE_LIMIT_HASH_SECRET` in Production and Preview. Use at least 32 random bytes,
keep it server-only and stable across instances, and never log or commit it.
Vercel creation admission uses only its platform-controlled
`x-vercel-forwarded-for`; a different proxy requires separate verification.
Missing platform IPs or admission storage fail closed with temporary
unavailability. Existing deterministic rules turns remain available.
See [fair-use admission](fair-use.md) for thresholds, limitations, tests, and
rules-only Quick Play behavior. OpenRouter's spending cap remains required.

## Automatic production migrations

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

This project does not configure Supabase per-branch databases. Preview deployments
use the Supabase connection values configured in Vercel for Preview.

## Search and social previews

English pages use unprefixed URLs; other languages retain locale prefixes such
as `/fi-FI`. Old `/en-US` URLs permanently redirect to their new equivalents.
Browser language does not redirect pages.

Public landing and About pages have localized titles, descriptions, canonical URLs,
and language alternates. `/robots.txt` points to `/sitemap.xml`, which lists the
localized landing and About pages and the canonical English developer page.
Individual game pages and the changing public-table directory use `noindex, follow`.
This is search-indexing guidance, not access control; table URLs remain shareable.

The canonical public origin defaults to `https://www.aiholdem.gg`, independently
of the Vercel deployment hostname. The bare domain `https://aiholdem.gg` redirects
to the `www` domain in Vercel. Set `NEXT_PUBLIC_APP_URL` to an absolute HTTP(S)
origin only to override this default; update or remove any existing override
pointing to the old deployment domain. These values are resolved at build time
for static pages, so rebuild after changing the domain. Submit `/sitemap.xml`
in Google Search Console after deploying.

Open Graph and Twitter cards use the committed 1200 × 630 `public/social-preview.png`.
The centered spade and wordmark fit inside the central square so compact thumbnail
crops retain the brand. The editable source is `public/social-preview.svg`; regenerate
the PNG with `node -e 'require("sharp")("public/social-preview.svg").png().toFile("public/social-preview.png")'`
(run with `nice -n 15` locally). No runtime image service is needed. When replacing
it, update its dimensions and alt text in `lib/seo.ts` and increment the image URL's
version query. Deploy and share a fresh link to verify the actual Slack unfurl;
existing messages may retain a cached preview.


## Human-departure rollout

Apply `20261019000000_add_human_departures.sql` before deploying application code.
It adds atomic departure and advancement RPCs, fences human non-fold actions,
cleans up human assignments in the completing action transaction, assigns fresh
engine identities to new human occupants, and retains
voluntary reveals through immutable hand ownership. Existing hosts and bot-credit
behavior persist. Completed human departures from older instances are reconciled
under game locks with a version increment for polling clients. Old application instances can register departure through the
retained release signature; current clients advance departing-human turns.

Run `npm run check`, `npm run build`, `npm run test:sql:departures`, the seat,
bot-claim, game-read, bot-context and personal-table SQL suites, and production
browser smoke. Before release, verify the two-browser departure/notification
flow on a Vercel preview containing this code or an explicitly authorized live
site. Local success alone does not verify the deployed `after()` lifecycle.

## Human turn timer rollout

Apply `20261022000000_add_human_turn_timers.sql`,
`20261023000000_fix_turn_timer_commit_binding.sql`, and
`20261024000000_expand_timer_action_return_rows.sql` in order before deploying the
application. The final migration expands historical action RPC return projections
to the new games row shape. Existing games retain Off; there is no timer backfill.
Old instances cannot advance configured timed hands without timer transitions;
drain old instances before enabling multiplayer timed hands.

Run `npm run check`, `npm run build`, `npm run test:sql:turn-timers`, and
`npm run test:e2e:smoke -- turn-timers.spec.ts`. Local browser tests shorten only
newly-created fixture deadlines directly in the local database; no application
production-duration override exists. Verify two-browser timeout notifications on
an authorized Vercel preview containing the change before release. Local tests
cannot prove Vercel's post-response notification lifecycle.

## Duplicate-safe creation rollout

Apply `20261027000000_add_creation_attempts.sql` before application code. It adds
a service-role-only attempt store and atomic admission/creation RPC; existing
persistence entry points remain available during rolling deployment. Completed
attempt records have no automatic expiry. Keep deletion tombstones and do not
truncate this store: doing so would allow old retries to create replacement tables.
Retention changes need a separate replay-safety design. Run `test:sql:creation`,
`test:sql:usage` and `test:e2e:ci` against the migrated local stack.

## Heads-up provider session context

Deploy `20261028000000_add_bot_session_context.sql` before the matching application.
It adds a service-role-only, stable snapshot RPC for current-hand history and up to
50 earlier completed hands, bounded before action loading. No backfill, historical
mutation or new environment variable is required. Keep `get_bot_hand_context` for
Equity Rules and rolling deployment. Generate/check database types using CLI 2.120.0
after applying every local migration; run check, offline context/bot benchmarks,
`test:sql:bot-context` and the production build. Privacy, claim ordering and version
checks must pass before release.

Production model configuration stays unchanged during the OpenRouter pilot.
Gateway compatibility is tested using the exact requested model/reasoning and
structured output, with fallback disabled. Treat the small paired match sample as
exploratory behavior evidence, not proof of stronger overall poker. Select a model
only after reviewing measured quality, latency, actual reported cost and unknown
billing coverage in the benchmark report.


## Jev and Eevo confidence-aware advice

The server registry selects `typesafe-poker-v4.1-confidence` for existing and newly
selected Jev seats after deployment. Eevo seats use `eevo-poker-v4.1-confidence`
through `ConfidenceAwareEevoPokerBot`, with the same advice and sizing cautions. It retains `jev-latest` and the existing
provider credentials/settings. No new schema, environment variable, feature flag
or model selection is required; the existing bot-session-context migration remains
a prerequisite. The shared Jev/Eevo advice is computed from the already-authorized and
validated context, after claim/context checks. Eevo retains `eevo-1`, its own endpoint/key and error handling; LLM and rules
bots retain their existing policies. `npm run check`, offline `test:bots`, context benchmarks and
`npm run build` verify the release; no schema-specific SQL check is needed for
this change. Production-sized behavioral strength still requires later evidence.

## Release verification and browser rollout

PR checks retain lint, strict TypeScript, unit tests, build, generated database
verification, every SQL suite and bot-pipeline integration. Complete Chromium
and WebKit production browser coverage runs at 03:00 UTC daily on current `main`
and on demand, outside PR CI. Record passing manual regression and hosted
production smoke evidence for release verification.

Production smoke uses the successful Vercel production repository dispatch,
validates the Vercel GitHub bot event, approved project/revision/URL and production
success state, and tests
that deployed revision with Chromium against its hosted app and Supabase. It uses
ordinary anonymous endpoints and private tables, with no hosted database keys or
provider bypass. It does not build, start a local stack, publish tables or roll
back a failed release. No Vercel API token, team variable or custom webhook is
required. Manual dispatch selects a completed original Vercel-triggered run ID
and reuses its validated seven-day target artifact through GitHub's automatic
token; arbitrary URL/SHA inputs are not accepted. Follow the release verification guidance in
[Production release smoke and rollout](../CONTRIBUTING.md#production-release-smoke-and-rollout).
That section documents manual inputs, concurrency, credential-free diagnostics,
fixture cleanup, rate-limit costs, accepted detection gaps and timing comparison.
