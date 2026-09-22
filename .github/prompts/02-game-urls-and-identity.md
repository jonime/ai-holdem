# Game URLs and Anonymous Player Identity

## Why This Is Next

Seats, spectating, and Realtime all assume a game is addressable by URL and
that a browser can be recognized as "the same participant" across reloads.
Today `POST /api/games` returns a `gameId` that only ever lives in
`window.localStorage` on the creating browser
([PokerApp.tsx](../components/poker/PokerApp.tsx#L338-L343)); there is no
`/game/[gameId]` route, so a game cannot be shared, bookmarked, or joined by a
second browser. This plan only introduces addressability and identity. It
does not add seat selection, multiplayer, or bots — that is
[03-seats-and-bots.md](./03-seats-and-bots.md).

## Outcome

* Creating a game redirects to `/game/[gameId]`; the URL is the source of
  truth for which game is being viewed, not `localStorage`.
* A browser can open a game URL it did not create and load the same sanitized
  public state that `GET /api/games/:id` already returns.
* Each browser gets a stable anonymous identity (a client token) so future
  work can tell "the browser that owns seat 0" apart from "some other
  visitor," without building accounts.

## Design

### Routing

* Add `app/game/[gameId]/page.tsx` that renders `PokerApp` with the
  `gameId` route param instead of reading `localStorage` on mount.
* Keep `app/page.tsx` as the "create a new game" entry point: it calls
  `POST /api/games` and redirects (`redirect()` or `router.push`) to
  `/game/:gameId`.
* `localStorage` can remain as a convenience "last game you created" pointer
  for the root page, but the game page itself must work from a cold load with
  only the URL — this is what makes the link shareable.

### Anonymous player token

* Introduce a `player_token` concept: a random UUID generated client-side on
  first visit and stored in a cookie (not `localStorage`, so it can be read by
  server routes) — e.g. `ai-holdem-player-id`, `httpOnly: false`,
  `sameSite: lax`, long expiry.
* Add a tiny helper (`lib/identity/player-token.ts`) used by the API routes to
  read/create this cookie. For this plan, the token is not yet tied to a seat
  or stored in `game_players` — it just needs to exist and be stable, so
  [03-seats-and-bots.md](./03-seats-and-bots.md) can use it for seat claiming
  without another cookie migration.
* Do not use the token as an authorization secret by itself long-term (it is
  guessable-adjacent and per-browser), but it is sufficient for an anonymous
  demo. Note this explicitly as a limitation in code comments so it is not
  mistaken for real auth later.

### API changes

* No breaking changes to `GET /api/games/:id` response shape.
* `POST /api/games` behavior is unchanged (still returns `{ gameId }`); the
  redirect happens client-side after that response.

## Steps

1. Add `lib/identity/player-token.ts` (get-or-create cookie helper) and wire
   it into the API route handlers via a shared middleware/util so every route
   can read the caller's token later without re-deriving this.
2. Add `app/game/[gameId]/page.tsx`; move the "load game by id" logic out of
   the mount-time `localStorage` read in
   [PokerApp.tsx](../components/poker/PokerApp.tsx) and into a prop/param.
3. Update the root `app/page.tsx` "New Game" action to redirect to
   `/game/:gameId` after creation.
4. Handle the "game not found" case in the game page (invalid/deleted
   `gameId`) with a clear not-found UI instead of a silent blank table.
5. Manual test: create a game in one browser, copy the URL, open it in a
   second (private) browser window, confirm the same public state loads.

## Test additions

* Route test (or integration test) that `GET /api/games/:id` for an unknown
  id returns 404, and the game page renders a not-found state for it.
* Test that the player-token cookie is set on first request and reused on
  subsequent requests (same value).

## Explicit non-goals here

* No seat selection, no second human player, no bots — single existing
  human-vs-AI flow keeps working exactly as today, just reachable by URL.
* No spectator mode yet (that needs the seats model from plan 03 to know
  what "not seated" means).
