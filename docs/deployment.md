# Deployment

## Vercel

1. Import the existing Git repository in Vercel.
2. Keep the default Next.js build settings (`npm run build`).
3. Add the environment variables in [`.env.example`](../.env.example) for
   Production and Preview.
4. Apply all required database migrations, then deploy.

The application uses the Supabase Data API from Next.js server routes, so keep
the Supabase Data API enabled. The browser never receives the Supabase secret
or TypeSafe API key.

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

Broadcast requires no additional SQL migration. Realtime lifecycle changes also
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

Open Graph and Twitter cards use the supplied 1731 × 909 `public/social-preview.png`.
The image is committed and needs no runtime service. When replacing it, update
its dimensions and alt text in `lib/seo.ts` to match the new asset.


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
