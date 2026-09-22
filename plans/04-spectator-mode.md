# Spectator Mode

## Why This Is Next

Once seats have a real `open | claimed | bot` lifecycle
([03-seats-and-bots.md](./03-seats-and-bots.md)), "visiting a game URL
without occupying a seat" is already a coherent state — this plan just gives
it a proper read-only UI and makes sure it never leaks private data. This
depends on plan 03 for the seat model and plan 02 for the shareable URL, but
not on Realtime (though it benefits enormously from it — see
[05-realtime-broadcast.md](./05-realtime-broadcast.md)).

## Outcome

* Anyone with a game URL and no claimed seat sees a read-only table view:
  board, pot, stacks, action history, whose turn it is — same sanitized
  projection any player already gets for public information.
* Spectators never see any hole cards, including the human's, and never see
  AI state/raw responses before a hand completes (this is already the rule
  for opponents in `PublicPokerPlayer.holeCards`
  ([types.ts](../lib/poker/types.ts#L54-L62)) — spectators just mean *every*
  seat is "opponent" from their point of view).
* Spectators can still claim an open seat from the same view if one exists.

## Design

### Identity and view resolution

* On load, the game page (from plan 02) determines the viewer's role by
  comparing the player token cookie against claimed seats returned for
  "is this you" (from plan 03): `seated` (this browser's token matches a
  seat) vs `spectator` (it doesn't match any).
* Reuse the existing public projection (`PublicPokerGame`) — do not create a
  parallel spectator-only endpoint. The only difference for a spectator is
  that *no* seat's hole cards are revealed (a seated human currently sees
  their own `holeCards`; a spectator sees none). Confirm
  `GET /api/games/:id` already parameterizes "whose hole cards to reveal" by
  caller identity rather than always revealing seat 0 — if it currently
  hardcodes "reveal the human seat," this plan must generalize that to
  "reveal only the requesting token's own seat, if any."

### UI

* `PokerApp` (or a new `SpectatorView` variant) renders the same table,
  pot, action history, and AI decision panel components, just with the
  action controls hidden/disabled and an "open seat" affordance shown
  instead of action buttons.
* No new components should be strictly required if the existing table
  components already accept "no hole cards for this seat" as a normal
  state (they should, since that's already true for the opponent AI seat
  pre-showdown).

## Steps

1. Confirm/adjust `GET /api/games/:id` to derive "which seat's hole cards
   to reveal" from the caller's player token rather than an assumption
   baked in earlier ("seat 0 human is always the caller").
2. Add viewer-role detection (`seated` vs `spectator`) to the game page/
   `PokerApp` based on token-vs-seat comparison from plan 03's DTO.
3. Hide/disable action controls and show "Sit here" affordances for
   spectators when seats are open; show a plain "spectating" indicator
   when all seats are filled.
4. Tests: a request with a token matching no seat never receives any
   `holeCards` for any seat, pre- or mid-hand; it does receive full public
   state (pot, board, history, whose turn) and post-hand history the same
   as any other viewer.

## Explicit non-goals here

* No spectator chat, reactions, or presence ("N people watching") — out of
  scope until requested.
* No access control beyond "don't leak private data"; any URL holder can
  spectate (matches the plan's existing no-auth demo posture).
