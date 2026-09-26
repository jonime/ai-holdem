# OpenRouter playstyle profiles

## Decision summary

OpenRouter bots should support a small, server-owned set of **playstyle
profiles**. This is a different concept from difficulty:

- difficulty intentionally makes a bot more or less accurate;
- a playstyle changes which reasonable risks and lines a bot prefers; and
- the OpenRouter model remains a separate deployment choice.

The first release should offer `balanced`, `tight`, and `aggressive`. Avoid a
"random" or deliberately bad profile: it would be hard to distinguish from
provider variance and would overlap with difficulty. A future `tricky` profile
should wait until the benchmark can demonstrate credible bluffing and trapping
rather than merely producing erratic actions.

Instructions can influence an LLM's play, but they are a **soft policy**, not a
guarantee. Model choice, model revisions, sampling, and the exact hand context
can all outweigh qualitative wording. The application must continue to enforce
legal actions and sizing locally. We should regard a profile as successful only
when a fixed scenario suite shows a repeatable, measurable shift in decisions.

## Product behavior

1. The lobby shows a playstyle selector only after an OpenRouter bot is
   selected. It defaults to `balanced`.
2. The three initial profiles are described in outcome-oriented language:
   - **Balanced** — seeks the highest expected chip value without a directional
     preference.
   - **Tight** — avoids marginal, high-variance continuations and requires a
     stronger edge before committing a large fraction of the effective stack.
   - **Aggressive** — prefers betting or raising over passive actions when both
     have comparable expected value, applies pressure with credible draws, and
     uses larger value sizes when appropriate.
3. Difficulty remains available only for providers that currently support it.
   Do not relabel playstyle as difficulty or silently map one to the other.
4. The selected profile is visible on the occupied seat and in bot decision
   diagnostics/history, so games remain understandable and auditable.
5. Existing OpenRouter seats and clients that omit a profile behave as
   `balanced`.

## Domain model and persistence

Introduce a provider-independent `BotPlaystyleId` union, initially
`"balanced" | "tight" | "aggressive"`, and a public descriptor containing an
ID, localized display key, and localized description key. Keep the actual
instructions out of public DTOs.

Add nullable `bot_profile_id` to `game_players` in a new timestamped migration.
Update the seat consistency constraint so it is non-null only for OpenRouter
bots, and backfill existing OpenRouter rows to `balanced`. Extend all affected
atomic RPC return types and JSON projections. Never edit an applied migration.

Carry `botProfileId` through the persisted player type, defensive Supabase row
parsing, public seat projection, and history/decision metadata. Reject unknown
values while parsing rather than asserting them. Persist only the stable ID,
not prompt text; this avoids storing operational instructions and lets wording
be improved without a migration.

Keep `OPENROUTER_BOT_PROFILES` as the model/catalog configuration it is today.
Do not multiply environment entries for every model/style combination. In this
design, `modelId` answers *which model?* and `botProfileId` answers *how should
it play?* Update README terminology to call those entries OpenRouter model
definitions, reducing the existing ambiguity around the word "profile".

## Prompt design

Create a server-only profile registry, for example
`lib/bots/openrouter-profiles.ts`, with exhaustive typed entries. Each entry
contains only trusted, static instructions. Do not accept free-form prompt text
from the browser, database, or environment.

Build the system message from two clearly separated blocks:

1. **Invariant policy** — use only supplied information, optimize expected chip
   value, choose only a supplied legal action and sizing, and return only the
   schema-constrained JSON.
2. **Profile preference** — a concise tie-break policy that must never override
   legality or invent hidden information.

The preference should be phrased as bounded poker behavior, not role-play. For
example, the aggressive profile should prefer pressure **when expected values
are comparable**, not "always raise." The tight profile should not be told to
fold profitable calls. This preserves basic competence and makes the profiles
different styles rather than disguised difficulty levels.

Pass the resolved profile into `OpenRouterPokerBot` through its constructor.
Include a new version such as `openrouter-poker-v2-balanced` (or store prompt
version and profile ID as separate diagnostics fields) so historical decisions
can be attributed to the exact policy. Keep the JSON schema, local legal-action
lookup, local sizing lookup, timeout, secret handling, and encrypted-reasoning
removal unchanged.

Do not expose chain-of-thought or ask the model for it. If explanations are
desired later, add a short categorical rationale to the structured schema and
treat it as untrusted display text; it must never participate in action
validation.

## Service and HTTP changes

1. Extend `POST /api/games/:id/seats/:seat/assign-bot` with optional
   `botProfileId`.
2. Resolve the bot descriptor first, then validate the combination:
   - OpenRouter: omitted means `balanced`; a known profile is accepted.
   - Other providers: the field must be absent (preferred) or `null`; reject a
     non-null profile rather than silently ignoring it.
3. Keep the host check, expected-version mutation, and one-action-per-mutation
   behavior unchanged.
4. In `ServerBotRegistry`, accept the persisted profile ID when creating an
   OpenRouter bot and resolve it against the server-only registry. Fail closed
   on corrupt or unknown persisted data.
5. Attach the profile ID to diagnostics before persistence. Do not add prompt
   instructions or raw provider responses to live/public responses.

The registry interface should take structured selection data rather than adding
positional arguments, for example `get({ botId, profileId })`. This makes an
invalid provider/profile combination explicit and leaves room for future bot
configuration without another breaking signature change.

## UI and localization

Add the selector alongside the existing bot and difficulty controls in the
lobby. Reset it to `balanced` when the selected provider changes away from
OpenRouter, and send it only for OpenRouter assignments. Disable controls while
the existing mutation is pending.

Add profile names, descriptions, selector labels, and the occupied-seat summary
to every game dictionary. The API should expose stable IDs and capability data,
not English UI copy. A small capability on `BotDescriptor`, such as
`configuration: { difficulty: boolean; playstyle: boolean }`, is preferable to
duplicating provider comparisons across the client and service.

This is a perceptible UI change, so implementation should include a Playwright
or browser screenshot showing an OpenRouter model selected with each available
profile control visible.

## Verification strategy

### Unit and integration tests

- Environment/catalog tests prove existing model definitions still parse and
  are not used as arbitrary prompt sources.
- Profile-registry tests prove all IDs resolve, the default is `balanced`, and
  public descriptors cannot contain instructions.
- OpenRouter request tests snapshot the invariant policy plus each profile
  fragment, while confirming the user message remains structured game state.
- Existing malformed JSON, illegal action, unavailable sizing, timeout, external
  inference guard, and reasoning-redaction tests continue to pass.
- Route/service tests cover defaulting, all valid OpenRouter profiles, rejection
  of unknown IDs, rejection on non-OpenRouter providers, authorization, stale
  versions, and persistence.
- Supabase parser/repository tests cover the new column, invalid stored values,
  RPC mappings, and the OpenRouter-only consistency rule.
- Component tests cover conditional visibility, localization, provider changes,
  and the exact assignment payload.

### Behavioral benchmark

Extend the offline policy harness with a fixed, labeled corpus of preflop and
postflop spots. For live OpenRouter evaluation, run every profile multiple times
against the same contexts and model revision, then report:

- fold/call/bet/raise frequency;
- average selected bet or raise size;
- large-pot commitment rate in marginal spots;
- value extraction in strong-hand spots;
- illegal/schema/provider failure rate; and
- estimated chip EV where the harness has a trustworthy oracle.

Acceptance should require zero locally accepted illegal actions, no material EV
collapse versus balanced, and directional evidence that tight folds or calls
more often in marginal high-variance spots while aggressive bets or raises more
often in close decisions. Record sample count, model ID, prompt version, and
temperature/provider parameters with results. Do not promise that profile
behavior is deterministic.

## Delivery sequence

1. Add typed profile definitions, prompt composition, diagnostics, and focused
   OpenRouter tests without changing persistence or UI.
2. Add the migration and end-to-end domain/repository/service plumbing, with
   `balanced` compatibility defaults.
3. Add API capability metadata, localized lobby controls, seat display, and UI
   tests/screenshots.
4. Add the behavioral benchmark and tune only the static profile fragments;
   version any materially changed prompt.
5. Run `npm run check` and, because routing/rendering/environment behavior is
   affected, `npm run build` before merging.

## Follow-up decisions

The recommended MVP needs no product decision beyond approval of the three
profiles above. Before implementation, the owner may instead choose one of
these scope changes:

- add `tricky` experimentally, hidden behind a non-production flag until the
  benchmark validates it;
- expose profile descriptions only in the lobby, or also show them in history;
  and
- pin exact OpenRouter model revisions for benchmark comparability, if the
  configured provider supports revision-pinned identifiers.

The safest default is three visible profiles, profile name (but not full
description) in history, and revision-pinned model IDs where available.
