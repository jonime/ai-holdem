# Gameplay guide

## Lobby and invitations

While a game is waiting, the lobby shows one contextual next step based on the
authoritative seat state, host permissions, and the host's current settings.
Hosts can start with any two occupied seats, including bots, and may stand up
before starting to watch as a spectator. Guests can take any open seat or wait
for the host as a spectator. Every waiting lobby also offers a localized copy
button for the clean game URL (origin plus localized path only); anyone with
that URL can view the table and take an open seat. If browser clipboard access
is unavailable, the lobby exposes the same URL in a selectable field for manual
copying.

Tables are private by default. Hosts can publish waiting tables to the public
directory; listings expire when the host is hidden or disconnected and return
when the host comes back. Anyone with a table URL can view it.

Bots advance while an eligible host or seated human has the table open. Other
spectators watch passively. Starting another hand requires explicit interaction.

## Betting controls

Each new decision (game ID, authoritative version, or viewer change) starts at
its engine-provided minimum bet or raise. Same-version polling preserves edits.
The numeric input and slider select a total street target. The compact “+amount”
below the numeric input shows additional chips paid, subtracting chips already
committed on this street. Empty, fractional, unsafe, and out-of-range
input disables only bet/raise submission. Buttons and keyboard shortcuts use the
same validated amount; action shortcuts are ignored while typing. Q/E and left/right
arrows adjust sizing by one big blind. Hold Shift with either shortcut to adjust
by five big blinds. Adjustments stay within the engine’s legal range, including
when the slider has keyboard focus.

50%, 75%, and Pot presets select amounts without submitting. For displayed pot P,
street commitment C, legal call cost K, and fraction f, bets target round(f × P),
and raises target C + K + round(f × (P + K)). The displayed pot includes side pots and unmatched chips already paid into the active hand.
Presets are clamped to the engine’s legal range; All-in selects its maximum.
The server and engine still validate every action and expected game version.

## End of table and fresh Quick Play

An owned seat is out of chips only once its zero stack is settled at hand completion
or it is no longer in the hand. An unresolved all-in can still win chips. Eliminated
players can start **New Quick Play**, or manually **Watch next hand** when eligible.
Ongoing hands show “You’re watching” and retain a disabled **Watch next hand**
button for eliminated players. A table with one remaining funded player
announces the winner and offers New Quick Play without Next Hand. Buttons, S,
Enter, Space, and the next-hand handler share eligibility; seated humans and hosts
of bot-only tables retain their existing controls and expected-version checks.
The final hand result and Actions remain available, including eligible card reveals.

## Completed hands and Actions

Completed hands show each winner’s awarded chips centered in the sizing area,
with an explanation for opponents folding or the public showdown hand category.
These are winnings, not net profit. Multiple winners are listed as “Pot awards”
since separate side pots do not necessarily constitute a split pot. Results use
current authoritative public game state, survive refresh and feed failures, and
clear when the next hand begins. The hidden sizing controls preserve the tray’s
height, keeping action buttons in place between hands on desktop and mobile.

Your own actions and blinds use bold text; spectators see a neutral feed. Win lines
use slightly larger green text and a thin separator to distinguish outcomes from
moves. Street headings show only the board cards already supplied by public feed
events. The panel follows updates within 24 pixels of the bottom; scrolling up
pauses following, and Latest action resumes it. Reopening starts at the latest
event. The debugging History button and modal are available only in development
(`npm run dev`); production builds, including deployed previews, hide them and
do not load history for the modal. The history API still enforces access and privacy rules.

## Provider pauses and retry

TypeSafe and LLM requests have a 60-second deadline, including reading the response.
A timeout, connection failure, rate limit, invalid response, or provider error
pauses play and leaves the bot seated without changing the game. The error banner
explains the failure in the selected language. Use **Retry bot** to refresh the
latest game and try again; polling does not retry the failed turn. A rate limit
may need time to clear. Only an eligible host or seated human can retry, and
repeated clicks cannot start parallel requests. Confirmed LLM credit failures
retain their existing legal fold and departure behavior.
