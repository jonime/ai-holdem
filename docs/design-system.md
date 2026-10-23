# Design system

AI Hold’em uses a modern poker-club visual language: ivory or ink page surfaces,
emerald/mint actions, restrained borders, clear sans-serif typography, and a
graphic green table. Desktop and mobile are equally important. New UI should
look like part of this application without introducing a separate visual style.

This guide documents the implemented redesign, initially merged in PR #60.
The current components and their effective CSS are the source of truth. Earlier
generated concept boards explain intent, but are not specifications for copy,
game rules, privacy, or pixel-perfect layouts. Update this guide when shared
design conventions intentionally change.

## Foundations

Use semantic variables from [`app/globals.css`](../app/globals.css), with CSS
Modules for component styling. Do not copy a light-theme hex value into a new
component or create a second theme palette. Some existing table-specific styles
use fixed colors; these are not a reason to hardcode new application surfaces.

| Purpose | Tokens and usage |
| --- | --- |
| Page and panels | `--surface-page`, `--surface`, `--surface-muted` |
| Text | `--text` for primary content; `--text-muted` for supporting content |
| Boundaries | `--border`; `--elevation` only when separation needs depth |
| Actions | `--accent-solid` with `--on-accent`; `--accent-hover` for hover; `--accent` for links |
| Keyboard focus | `--focus`; retain a visible outline and offset |
| Errors and attention | `--danger` / `--danger-surface`, `--attention` / `--attention-surface` |
| Poker table | `--felt`, `--felt-surface`, `--felt-edge`, `--on-felt`, `--seat-surface` |
| Cards | `--card-surface`, `--card-ink`, `--card-back`; retain suit symbols |

Light mode pairs ivory `#f6f5f0` with ink text and emerald actions. Dark mode
pairs ink `#111918` with pale text and mint actions. The felt and card surfaces
remain deliberately distinct from the surrounding application in both modes.
Read exact values from CSS rather than maintaining a duplicate palette here.
Prefer the semantic names above over legacy aliases such as `--paper` and `--ink`.

Headings use the existing Space Grotesk variable; body text and controls use
`--font-body`. Preserve locale-specific CJK fallbacks. Global headings use tight
tracking and line height; body text uses a 1.5 line height, with more room in
editorial content. Use tabular numerals for changing chip amounts and counters.
Do not introduce a new font or use monospace for ordinary paragraphs.

Follow the neighboring component’s spacing. Common gaps/padding are 8, 12, 16,
24 and 32px; there is no universal spacing-token API. Controls generally have
8px corners, panels and seat plaques 12px, and status pills fully rounded
corners. Match an existing pattern before choosing a new size. Use subtle
borders and elevation rather than heavy offset shadows or paper textures.

## Reuse before creating

| Need | Existing implementation |
| --- | --- |
| Public navigation and brand | [`PublicHeader`](../components/PublicHeader.tsx) |
| Gameplay navigation | [`GameHeader`](../components/poker/GameHeader.tsx) |
| Buttons and sizing presets | [`Button`](../components/Button.tsx) and its CSS Module |
| Appearance choice | [`AppearanceControl`](../components/AppearanceControl.tsx) |
| Accessible overlays | [`Modal`](../components/poker/Modal.tsx), plus the appropriate existing dialog |
| Live-turn notice inside overlays | [`ModalTurnWarning`](../components/poker/ModalTurnWarning.tsx) |
| Cards and chip presentation | [`PlayingCard`](../components/poker/PlayingCard.tsx), [`AmountDisplay`](../components/poker/AmountDisplay.tsx) |
| Table arrangement | [`seat-position.ts`](../components/poker/seat-position.ts), shared by live, lobby and replay views |

Use a primary button for the main action and secondary/outline treatment for
alternatives. Ghost/icon controls suit supporting tools; icon-only controls need
accessible names. The existing `green` variant stays emerald in both themes;
ordinary primary actions adapt through theme tokens. Do not introduce another
button implementation to reproduce either treatment. Keep destructive actions
distinct and preserve their confirmation flow.

Standard buttons and fields have at least 44px touch targets, large buttons 52px,
and betting action buttons 56px. Compact seat controls may expand their hit area
without enlarging their visible label. Check adjacent targets for overlap.
Disabled, pending, error and success states must remain understandable with text
or semantics rather than color alone.

## Layout and content patterns

- **Public pages:** use the spade wordmark, shared navigation, restrained
  illustration and generous editorial spacing. The landing page owns the large
  photographic illustration; gameplay remains CSS/SVG/card graphics. Use the
  existing brand assets in `public/` rather than inventing alternate logos or
  bot portraits. Suit icons identify bot families without implying capabilities.
- **Play and lobby:** keep creation actions prominent, collection navigation
  consistent, and status/occupancy easy to scan. Match the existing table rows,
  seat-management panels and settings fields. Empty and failure states belong
  inside the same layout, with an explicit next action when appropriate.
- **Gameplay:** retain perimeter seating and an unobstructed board/pot. Seat
  plaques distinguish stacks, wagers, roles and actor state. Visual rotation
  must never change physical seat identity or engine order. The action tray is
  sticky with safe-area spacing; preserve scrolling on short screens. Keep
  total bet target separate from additional chips paid.
- **Responsive behavior:** use the existing component breakpoints, commonly
  640px for compact layouts and 1100px for the live Actions sidebar. Public bot
  cards also use 1024px. Do not impose one breakpoint on unrelated layouts.
  Allow localized text to wrap and inspect the final CSS cascade: some modules
  contain earlier declarations overridden by the redesign.
- **Dialogs:** reuse native dialog focus, dismissal and scroll locking. Match
  the relevant dialog’s header, content scrolling and action area; there is no
  universal new sheet component to substitute. Keep Close and live-turn warnings
  reachable. Opening Help, Settings, results or replay never pauses the live game.
- **Results and replay:** use existing data and visibility rules. Keep street
  navigation, playback controls, highlights and unavailable-history notices
  recognizable. Do not add decorative statistics or change disclosure text to
  fit a mockup.

Use short, literal labels and server-owned translations. Do not shorten away
sharing/privacy disclosures, recovery guidance, or the distinction between
watching and claiming a seat. Use the established notice components and
diagnostic controls rather than replacing actionable errors with transient toast
messages.

## Appearance and interaction invariants

System is the default; Light and Dark are browser-local overrides. Reuse the
shared controller and `ai-holdem-theme` preference. Do not add theme cookies to
cached pages, a second storage key, or component-local theme state. Preserve the
pre-paint script, no-JavaScript CSS fallback, cross-tab synchronization and
standalone 404 handling. Changing appearance must not reset game state, drafts,
replay position or focus. See [architecture](architecture.md#presentation-and-appearance)
for implementation details and [gameplay](gameplay.md) for user-facing behavior.

Keep transitions brief; the shared button transition is 120ms. Respect the
global reduced-motion override. Never animate away or delay legal actions.
Retain keyboard focus outlines, card suit symbols, classic/four-colour support,
and screen-reader labels. Verify contrast in both themes, including felt,
disabled states, status badges and focus rings.

## Visual references and review

Use the implemented pages and deterministic captures from
[`club-redesign.spec.ts`](../test/e2e/club-redesign.spec.ts) as references. The
suite writes screenshots to `test-results/`; these are review artifacts, not
automatically approved pixel-comparison baselines. Do not use the generated
concept images as golden screenshots or capture private production games for
documentation.

For a UI change:

1. Read this guide and the closest existing component, including its final CSS
   overrides. Reuse its tokens and primitives.
2. Review light and dark, desktop and mobile, plus affected loading, empty,
   error, pending and completed states. Include long translated labels.
3. Check 1440×900, 1024×768, 390×844, 320×568 and short landscape layouts where
   relevant. For table changes, cover 2–6 seats, visible cards and betting
   controls. Verify 200% zoom, keyboard operation and reduced motion.
4. Follow [Club appearance verification](../CONTRIBUTING.md#club-appearance-verification)
   for the existing local-only production runner, fixtures and checks. Compare
   captures visually; a passing screenshot capture alone does not prove quality.
5. Update this guide if the change establishes a new shared convention. Keep
   implementation details and contributor commands in their existing guides.

Avoid one-off palettes, new font families, neon/glass effects, heavy texture,
unnecessary decorative avatars, tiny touch targets and hidden recovery controls.
Extend the current visual language instead of redesigning each new feature.
