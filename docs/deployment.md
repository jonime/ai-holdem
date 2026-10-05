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

This demo does not configure Supabase per-branch databases. Preview deployments
use the Supabase connection values configured in Vercel for Preview.

## Search and social previews

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
