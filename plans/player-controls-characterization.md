# Player controls extraction: existing behavior

The extraction preserves these existing distinctions; they are not gameplay changes
or fixes made by the refactor. `PokerApp.controls.test.tsx` characterized draft
refreshes, current legal-action lookup, click/shortcut confirmation and overlay
blocking before extraction. `usePlayerControls.test.ts` exercises the extracted
hook separately, including effect teardown and re-execution.

- Draft scope uses game ID, authoritative version and viewer participant ID. A
  legitimate actor change advances the version and resets the draft. A synthetic
  actor change with the same version/viewer does not independently reset it.
- Sizing shortcuts retain their historical listener guards (loading, Quick Play
  creation, eligibility, deadline, overlay and keyboard target). A draft can still
  change during request/recovery blocking, though the shared intent handler blocks
  submission. Next hand and Show cards likewise rely on their existing session
  callback safeguards beyond the listener guards. Broadening those guards is a
  separate behavior change.
- The shared intent handler rejects a null sized selection. Explicit numeric
  overrides are passed to the existing session validation, rather than introducing
  another legality or mutation pipeline in the controls hook.

The confirmation dialog keeps its synchronous shared submission lock, and the shell
revalidates both Check and Fold against the live decision before submission.
