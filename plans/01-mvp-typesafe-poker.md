# TypeSafe AI Texas Hold'em Demo

## Current Baseline And Delivery Gates

The repository currently contains this plan only. Phase 1 therefore includes
project initialization, test tooling, and the initial application skeleton.

The implementation proceeds only when each phase gate is met:

1. **Setup gate:** the Next.js application builds, lints, typechecks, and
  starts locally.
2. **Engine gate:** deterministic tests prove that the selected engine can
  run a heads-up no-limit hand through showdown with authoritative legal
  actions and winner determination.
3. **Persistence gate:** a game can be created, reloaded, and safely updated
  once using optimistic concurrency.
4. **Turn gate:** server validation rejects stale, out-of-turn, duplicate, and
  illegal human actions while a deterministic test harness completes hands.
5. **AI gate:** a validated TypeSafe decision can be persisted and applied as
  exactly one legal engine action; malformed or unavailable responses leave
  the game state unchanged.
6. **UI gate:** the browser can complete multiple persisted hands without
  revealing hidden cards or private AI data before a hand completes.

Do not begin Supabase or TypeSafe integration until the engine gate passes.
Do not begin Realtime work until the normal HTTP flow passes the UI gate.

Build a small web application demonstrating how **TypeSafe AI can make decisions from structured application state** by having it play Texas Hold'em.

This is a technology/demo project, not a real-money poker application.

## Goal

Create a visually understandable Texas Hold'em game where:

* TypeSafe AI controls one poker player.
* A human controls the opposing player through the browser.
* A JavaScript/TypeScript poker engine controls the actual poker rules.
* TypeSafe AI receives structured game state and chooses a legal action.
* Human actions are submitted to the server and validated against the same legal-action rules.
* Supabase stores games, hands, actions, AI inputs, AI outputs, probabilities and confidence.
* The UI shows what the AI saw and what decision it made.
* The application is deployable to Vercel.

The important demo flow is:

```text
Poker engine state
        ↓
Convert into clean AI state
        ↓
TypeSafe AI Choice
        ↓
fold / check / call / bet / raise
        ↓
Validate action
        ↓
Poker engine applies action
        ↓
Persist result in Supabase
        ↓
Update UI
        ↓
Next player / next street
```

The application should make the AI decision process visible rather than hiding it.

---

# Technology Stack

Use:

* Next.js latest stable version
* App Router
* TypeScript
* React
* Tailwind CSS
* Vercel
* Supabase

  * Postgres
  * optionally Realtime
* TypeSafe AI
* A maintained JavaScript/TypeScript Texas Hold'em engine

Prefer an existing poker engine rather than implementing poker rules from scratch.

Investigate `@hivetech/poker-engine` first.

IMPORTANT: inspect the installed package's actual TypeScript definitions and exports before writing integration code. Do not invent poker-engine APIs based on assumptions.

Wrap the selected engine behind our own adapter so that changing poker-engine libraries later is easy.

Example:

```ts
interface PokerEngineAdapter {
  createGame(config: GameConfig): PokerGameState;
  startHand(state: PokerGameState): PokerGameState;
  getLegalActions(state: PokerGameState): LegalAction[];
  applyAction(
    state: PokerGameState,
    action: PokerAction
  ): PokerGameState;
}
```

The rest of the application must depend on this interface rather than directly depending on the third-party package.

### Engine Evaluation Spike

Before committing to an engine, install it in the initialized project and
inspect its actual package exports, TypeScript declarations, and behavior. The
candidate must demonstrate all of the following in an automated local test:

* heads-up no-limit Texas Hold'em with blinds;
* a clear current actor and complete legal action information, including legal
  minimum and maximum bet/raise amounts;
* application of fold, check, call, bet, raise, and all-in actions;
* automatic street progression and showdown/winner resolution;
* deterministic test support through a seed, injected deck, fixture state, or
  another controlled mechanism;
* safe serialization and restoration of authoritative state, or a documented
  adapter-owned serialized format that can recreate the engine state.

If `@hivetech/poker-engine` fails any required criterion, evaluate a maintained
alternative before implementing the adapter. Do not infer APIs from package
documentation alone.

---

# MVP Scope

Build the first version as:

```text
TypeSafe AI
    vs
Human Player
```

Heads-up No-Limit Texas Hold'em.

Starting configuration:

```text
Players: 2
Starting chips: 10,000 each
Small blind: 50
Big blind: 100
```

The TypeSafe player is the focus of the demo.
The human chooses from legal actions rendered by the UI. The server must validate every submitted action and amount before the poker engine applies it.

Do NOT implement initially:

* more than one human player
* more than one AI-controlled player
* random or deterministic fallback bots
* user accounts
* tournaments
* real money
* poker rooms
* matchmaking
* complex poker AI
* WebSocket game servers
* advanced opponent modeling

Design player and seat abstractions so additional human players and multiple independently configured TypeSafe AI bots can be added later. Do not hardcode game logic to exactly one human or one AI, but do not build multiplayer transport, lobbies, or additional bots yet.

---

# Architecture

Use approximately this architecture:

```text
┌───────────────────────────────┐
│            Vercel             │
│                               │
│          Next.js              │
│                               │
│  React Poker UI               │
│          │                    │
│          ▼                    │
│  Next.js Server Routes        │
│          │                    │
│     Game Orchestrator         │
│       /          \            │
│      ▼            ▼           │
│ Poker Engine   TypeSafe AI    │
│      │                        │
└──────┼────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│          Supabase             │
│                               │
│ Postgres                      │
│ - games                       │
│ - players                     │
│ - hands                       │
│ - actions                     │
│ - ai_decisions                │
│                               │
│ Realtime (optional initially) │
└───────────────────────────────┘
```

The poker engine is authoritative about:

* cards
* deck
* turns
* betting
* stacks
* pots
* legal actions
* streets
* showdown
* winners

TypeSafe AI is authoritative about NOTHING in the game rules.

It only proposes a decision.

The flow must always be:

```text
AI proposes action
→ application validates action
→ poker engine executes action
```

Never allow TypeSafe AI to directly modify game state or Supabase game-state records.

---

# Suggested Project Structure

Use something approximately like:

```text
app/
  page.tsx

  game/
    [gameId]/
      page.tsx

  api/
    games/
      route.ts

      [gameId]/
        route.ts

        start/
          route.ts

        action/
          route.ts

        step/
          route.ts

        reset/
          route.ts

components/
  poker/
    PokerTable.tsx
    CommunityCards.tsx
    PlayerSeat.tsx
    PlayingCard.tsx
    Pot.tsx
    ActionHistory.tsx

  ai/
    AIDecisionPanel.tsx
    ProbabilityBar.tsx
    AIStateViewer.tsx

lib/
  poker/
    engine.ts
    types.ts
    adapter.ts
    ai-state.ts
    orchestrator.ts
    validation.ts

  typesafe/
    client.ts
    questions.ts
    types.ts

  supabase/
    client.ts
    server.ts
    queries.ts

types/
  database.ts
```

Keep business logic out of React components.

---

# Supabase Database

Create migrations for the following basic model.

## games

```text
id uuid primary key
status text
current_state jsonb
hand_number integer
version integer
created_at timestamptz
updated_at timestamptz
```

`current_state` contains the serialized authoritative poker-engine state if the selected engine safely supports serialization.

Store an adapter-owned, versioned serialization format rather than an opaque
third-party object whenever the engine does not guarantee stable round-trip
serialization. Include a `state_schema_version` in that format so future
adapter changes can reject or migrate incompatible saved games deliberately.

`version` should increment whenever game state changes. Use it to protect against accidentally applying two actions to the same game state.

Every mutation must use a compare-and-swap update requiring the caller's
expected version. The database update must atomically change the state and
increment `version`; a zero-row update is a conflict and must not create an
action or AI decision record. Accept an optional client action idempotency key
for human submissions so a network retry can return the original result rather
than reporting a confusing duplicate failure.

Possible statuses:

```text
waiting
playing
complete
error
```

---

## game_players

```text
id uuid primary key
game_id uuid
seat integer
name text
controller text
stack integer
created_at timestamptz
```

Controller values:

```text
typesafe_ai
human
```

The schema and domain model must allow multiple player rows with either controller type. AI-specific configuration should belong to the player/agent rather than global game state so multiple TypeSafe bots can be added later.

MVP contains:

```text
seat 0 → Human Player
seat 1 → TypeSafe AI
```

---

## hands

```text
id uuid primary key
game_id uuid
hand_number integer
status text
initial_state jsonb
final_state jsonb
started_at timestamptz
completed_at timestamptz
```

---

## actions

```text
id uuid primary key
game_id uuid
hand_id uuid
player_id uuid
sequence integer
street text
action text
amount integer nullable
state_before jsonb
state_after jsonb
created_at timestamptz
```

Possible actions depend on the poker engine, but may include:

```text
fold
check
call
bet
raise
all_in
```

Preserve actions in chronological order.

---

## ai_decisions

This table is especially important for the demo.

```text
id uuid primary key
game_id uuid
hand_id uuid
player_id uuid
action_sequence integer

state jsonb

legal_actions jsonb

choice text
probabilities jsonb
confidence numeric

raise_size_choice text nullable
raise_size_probabilities jsonb nullable

raw_response jsonb

created_at timestamptz
```

The purpose is to record exactly:

```text
what the AI saw
+
what options it had
+
what it chose
+
how strongly it preferred each option
```

This allows AI decisions to be replayed and inspected later.

---

# TypeSafe AI Integration

Read current documentation before implementing:

https://docs.typesafe.ai/primitives/choice

Use the TypeSafe System One API.

Current API shape:

```text
POST https://api.typesafe.ai/v1/systemone
```

Use:

```json
{
  "model": "jev-latest",
  "state": {},
  "questions": {}
}
```

Keep `TYPESAFE_API_KEY` server-side.

Never expose the TypeSafe API key in client JavaScript.

Create:

```text
lib/typesafe/client.ts
```

as the only low-level TypeSafe HTTP client.

---

# AI Poker State

Do NOT send the poker engine's giant internal object directly to the model.

Create a normalized and intentionally understandable state.

Create:

```text
lib/poker/ai-state.ts
```

with something similar to:

```ts
export interface PokerAIState {
  game: {
    variant: "no_limit_texas_holdem";
    smallBlind: number;
    bigBlind: number;
    handNumber: number;
  };

  hand: {
    street: "preflop" | "flop" | "turn" | "river";
    pot: number;
    communityCards: string[];
  };

  hero: {
    holeCards: string[];
    position: string;
    stack: number;
    investedThisStreet: number;
    amountToCall: number;
  };

  opponents: Array<{
    id: string;
    position: string;
    stack: number;
    status: string;
  }>;

  actionHistory: Array<{
    street: string;
    player: string;
    action: string;
    amount?: number;
  }>;

  legalActions: LegalAction[];
}
```

Example:

```json
{
  "game": {
    "variant": "no_limit_texas_holdem",
    "smallBlind": 50,
    "bigBlind": 100,
    "handNumber": 12
  },
  "hand": {
    "street": "flop",
    "pot": 1950,
    "communityCards": ["Qh", "7c", "2s"]
  },
  "hero": {
    "holeCards": ["Ah", "Qd"],
    "position": "button",
    "stack": 6100,
    "investedThisStreet": 0,
    "amountToCall": 650
  },
  "opponents": [
    {
      "id": "human-1",
      "position": "big_blind",
      "stack": 5350,
      "status": "active"
    }
  ],
  "actionHistory": [
    {
      "street": "preflop",
      "player": "HUMAN",
      "action": "raise",
      "amount": 300
    },
    {
      "street": "preflop",
      "player": "HERO",
      "action": "raise",
      "amount": 900
    },
    {
      "street": "preflop",
      "player": "HUMAN",
      "action": "call",
      "amount": 600
    },
    {
      "street": "flop",
      "player": "HUMAN",
      "action": "bet",
      "amount": 650
    }
  ],
  "legalActions": [
    {
      "type": "fold"
    },
    {
      "type": "call",
      "amount": 650
    },
    {
      "type": "raise",
      "minAmount": 1300,
      "maxAmount": 6100
    }
  ]
}
```

Never expose hidden opponent cards in this object.

The public game projection must be a separate explicit DTO, not the serialized
engine state with fields removed ad hoc. Before showdown or a fold, it must
exclude AI hole cards, opponent private state, TypeSafe input state, and raw
TypeSafe responses. Reveal the persisted AI input and raw response only after
the associated hand has completed.

---

# Dynamically Generate Choice Criteria

Do not always send:

```text
fold
call
raise
```

Texas Hold'em has situations where those actions are not legal.

For example:

```text
check
bet
fold
call
raise
```

may each appear in different situations.

Generate TypeSafe criteria from the poker engine's current legal actions.

Example:

```ts
function createActionCriteria(
  legalActions: LegalAction[]
): Record<string, string> {
  const criteria: Record<string, string> = {};

  if (hasAction("fold")) {
    criteria.fold =
      "Surrender the hand and stop participating in the current pot.";
  }

  if (hasAction("check")) {
    criteria.check =
      "Continue without adding chips when no wager needs to be matched.";
  }

  if (hasAction("call")) {
    criteria.call =
      "Match the current wager and continue in the hand.";
  }

  if (hasAction("bet")) {
    criteria.bet =
      "Make the first wager on the current betting street.";
  }

  if (hasAction("raise")) {
    criteria.raise =
      "Increase an existing wager.";
  }

  return criteria;
}
```

This ensures TypeSafe can only choose valid action categories.

---

# Main TypeSafe Question

Construct something similar to:

```json
{
  "action": {
    "type": "choice",
    "instructions": "Choose the best legal action for HERO in this Texas Hold'em hand. Base the decision only on the provided state. Consider HERO's cards, the community cards, position, pot size, amount required to continue, effective stacks and previous actions. Do not assume hidden cards or information that is not provided.",
    "criteria": {
      "fold": "Surrender the hand because continuing is less appropriate than giving up the pot.",
      "call": "Match the current wager without increasing it.",
      "raise": "Increase the current wager because aggression is preferable to calling or folding."
    }
  }
}
```

Generate `criteria` dynamically.

Read:

```ts
response.answers.action.choice
response.answers.action.probabilities
response.answers.action.confidence
```

Store all of these values.

---

# Bet / Raise Sizing

The action `raise` is incomplete without an amount.

Do NOT ask the AI for an arbitrary numeric value initially.

Use another constrained TypeSafe Choice.

For example:

```json
{
  "sizing": {
    "type": "choice",
    "instructions": "If HERO bets or raises, choose an appropriate legal sizing. Ignore this answer when the selected action does not require a bet size.",
    "criteria": {
      "small": "Use a relatively small legal bet or raise.",
      "medium": "Use a medium-sized bet or raise.",
      "large": "Use a large bet or raise.",
      "all_in": "Commit the maximum legal amount."
    }
  }
}
```

Convert these categories deterministically into actual legal chip amounts.

For example:

```text
small  → minimum legal raise / approximately 33% pot
medium → approximately 50-66% pot
large  → approximately 75-100% pot
all_in → maximum legal amount
```

Clamp every calculated value to the poker engine's legal minimum and maximum.

The poker engine remains authoritative.

If sizing is irrelevant because the AI chose `fold`, `check`, or `call`, ignore the sizing answer.

---

# TypeSafe Decision Function

Create:

```ts
async function decidePokerAction(
  state: PokerAIState
): Promise<AIDecision>
```

Return a normalized result:

```ts
interface AIDecision {
  action:
    | "fold"
    | "check"
    | "call"
    | "bet"
    | "raise";

  amount?: number;

  probabilities: Record<string, number>;

  confidence: number;

  sizing?: {
    choice: string;
    probabilities: Record<string, number>;
    confidence: number;
  };

  rawResponse: unknown;
}
```

Before returning:

1. confirm the selected action is legal,
2. confirm any amount is legal,
3. reject malformed TypeSafe responses,
4. do not silently mutate an illegal answer into something unrelated.

---

# Game Orchestrator

Create:

```text
lib/poker/orchestrator.ts
```

The orchestrator controls turns.

Conceptually:

```ts
async function stepGame(gameId: string) {
  // Load authoritative state.

  // Determine current player.

  // Get legal actions from poker engine.

  // If player is TypeSafe AI:
  //   create PokerAIState
  //   call TypeSafe
  //   validate result
  //   save AI decision
  //   apply action

  // If player is human:
  //   return without applying an action and wait for a validated submission

  // Save action.

  // Save new game state.

  // If street/hand/game finished:
  //   handle transition.

  // Return updated state.
}
```

Only execute ONE poker action per `stepGame()` invocation.

For the MVP, `stepGame()` only advances an AI-controlled turn. A human turn is advanced by a separate validated action submission. Keep turn dispatch based on the acting player's controller so additional humans and AI bots can reuse the same orchestration later.

The frontend calls `/api/games/[gameId]/step` when it is a TypeSafe AI turn.

---

# API Routes

Implement approximately:

```text
POST /api/games
```

Creates a game.

Returns:

```json
{
  "gameId": "..."
}
```

---

```text
POST /api/games/:id/start
```

Starts the first hand.

---

```text
GET /api/games/:id
```

Returns sanitized public game state.

Return the human player's own cards, but never return the TypeSafe AI player's hidden cards until showdown. Do not expose them indirectly through stored AI state or raw TypeSafe responses during the hand.

---

```text
POST /api/games/:id/action
```

Submits one human action:

```json
{
  "action": "call",
  "amount": 650,
  "expectedVersion": 12
}
```

The server must confirm that it is the human player's turn, validate the action and amount against the poker engine's current legal actions, enforce the expected version, apply exactly one action and persist the result.

---

```text
POST /api/games/:id/step
```

Executes exactly one player action.

If current actor is TypeSafe:

```text
build state
→ TypeSafe request
→ validate
→ execute
→ save
```

If current actor is human:

```text
return the current state and legal actions
→ wait for POST /action
```

Return:

```json
{
  "game": {},
  "lastAction": {},
  "aiDecision": {}
}
```

`POST /step` must reject attempts to advance a human turn. The response's `aiDecision` is populated only when TypeSafe acted.

---

```text
POST /api/games/:id/reset
```

Starts a clean demo game.

---

# Poker UI

Create a visually simple poker table.

It does not need casino-level graphics.

Show:

```text
              TYPESAFE AI
               8,750
               [?][?]


             POT 1,950

          Q♥   7♣   2♠


              A♥ Q♦
               YOU
               7,300
```

Show:

* player names
* stacks
* dealer/button position
* hole cards
* hidden opponent cards
* board
* pot
* current actor
* latest action
* legal human action buttons and valid bet/raise controls when it is the human's turn

Use simple card components rather than images if easier.

---

# AI Decision Panel

This is one of the most important UI components.

When TypeSafe acts, show its decision probabilities and confidence without revealing its hidden cards during an active hand:

```text
TYPEsafe AI decision

Board
Q♥ 7♣ 2♠

Pot
1,950

Facing
650

Decision

Fold       0.04   █
Call       0.67   █████████████
Raise      0.29   ██████

Selected: CALL
Confidence: 0.71
```

Probability bars should be based directly on TypeSafe's returned probabilities.

Also provide a collapsible:

```text
View AI state
```

section showing the exact JSON sent to TypeSafe.

Because that JSON contains the AI player's hole cards, keep the exact state and raw response unavailable to the human until the hand is complete. Persist them immediately on the server, then reveal them in hand history after showdown or a fold.

This is important because the point of the demo is:

```text
structured state
→ typed decision
```

---

# Action History

Show the current hand history:

```text
Preflop
YOU raise to 300
AI raises to 900
YOU call

Flop Q♥ 7♣ 2♠
YOU bet 650
AI calls 650
```

Highlight TypeSafe AI actions differently in the UI if convenient.

---

# Game Controls

Add these controls:

```text
New Game
Fold / Check / Call
Bet / Raise amount
```

Only render actions currently reported as legal by the server. Disable controls while a request is in flight. After a human action succeeds, trigger one `/step` request when the next actor is TypeSafe AI, then return control to the human when appropriate.

Do not create a long-running server process or depend on Vercel process memory. Each request applies at most one action.

---

# Supabase Realtime

Realtime is optional for the initial playable MVP.

First make this work:

```text
HTTP request
→ update DB
→ return state
→ React updates
```

Once that works, optionally add Supabase Realtime.

For an early prototype, Postgres Changes is sufficient.

If building toward a more production-like implementation, prefer Supabase Broadcast for game events.

Possible channel:

```text
game:<gameId>
```

Possible events:

```text
game_updated
player_action
ai_decision
hand_started
hand_completed
```

Do not let Realtime become a blocker for completing the core demo.

---

# Security

Keep server secrets server-side.

Expected environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

SUPABASE_SECRET_KEY=

TYPESAFE_API_KEY=
```

Do not prefix server secrets with `NEXT_PUBLIC_`.

Never send TypeSafe credentials to the browser.

Enable appropriate Supabase RLS before allowing public access.

For the first private developer demo, authentication can be deferred.

---

# Concurrency / State Safety

Do not trust the browser as authoritative game state.

When `/step` executes:

1. load the latest state from Supabase,
2. check its version,
3. apply exactly one action,
4. increment the version,
5. persist the result.

Prevent two concurrent `/step` requests from applying two actions to the same state.

Implement this either with:

* optimistic concurrency using `version`, or
* a suitable Supabase/Postgres transaction/RPC.

Keep the initial implementation simple but do not ignore duplicate-action protection.

---

# Error Handling

The UI should gracefully display:

```text
AI decision failed
Retry
```

Cases to handle:

* TypeSafe unavailable
* malformed TypeSafe response
* illegal TypeSafe choice
* illegal raise amount
* poker-engine error
* Supabase error
* game already completed
* duplicate `/step` request

Do not automatically substitute a random AI action when TypeSafe fails because the purpose of the application is to demonstrate TypeSafe.

When an AI request fails, retain the existing authoritative state and record a
non-mutating error for the UI. A retry must perform a fresh version-checked
step; it must not replay or partially apply an earlier response.

---

# Development Sequence

Implement this incrementally.

## Phase 1 — Project setup

Create the repository's first Next.js TypeScript application. Select and record
the package manager, then configure strict TypeScript, Tailwind, ESLint, and a
unit-test runner suitable for server-side adapter tests.

Configure:

* Tailwind
* a `.env.example` containing only variable names and non-secret guidance
* an initial environment-variable validation module that keeps server-only
  values out of client bundles
* scripts for `dev`, `build`, `lint`, `typecheck`, and `test`

No UI polish yet.

Success criterion:

```text
dev server, build, lint, typecheck, and test commands run successfully
```

works without errors.

---

## Phase 2 — Poker engine

Run the engine evaluation spike first. Once a candidate passes, create the
poker adapter and keep all vendor-specific types private to it. Define the
application-owned game, seat, action, legal-action, and serialization types
before writing orchestration code.

Prove that locally we can:

```text
create game
start hand
deal cards
get legal actions
apply actions
advance streets
reach showdown
determine winner
```

Add unit tests around the adapter.

Tests must be deterministic. Use a seeded or injected deck when available; do
not assert exact card sequences from an uncontrolled shuffle. The tests must
cover fold, check/call, legal and illegal raises, all-in behavior, every street,
showdown, and a new hand with a fresh board and cards.

Do not involve Supabase or TypeSafe yet.

---

## Phase 3 — Supabase

Create migrations.

Persist:

```text
game
players
hands
actions
current poker state
```

Confirm a game can be created and reloaded from the database.

Add database constraints for controller/status/action domains, game/seat
uniqueness, chronological action sequence uniqueness, and valid foreign keys.
Implement mutations through a version-checked RPC or another atomic
compare-and-swap mechanism; read-then-write application code alone is not
sufficient under concurrent Vercel requests. Establish RLS policies before any
public deployment, even if the first developer demo has an intentionally
limited access model.

---

## Phase 4 — Human turns

Add server-side human action submission and validation.

The UI must only offer legal actions, and the server must reject stale, out-of-turn or illegal submissions.

At this stage run:

```text
a complete hand using a deterministic test harness that submits legal actions for both seats
```

and verify an entire hand can finish without errors. This harness is test-only and must not become a production bot.

This provides a working poker loop before adding AI.

---

## Phase 5 — TypeSafe AI

Implement:

```text
Poker engine state
→ PokerAIState
→ TypeSafe Choice
→ validated PokerAction
```

Store every decision in `ai_decisions`.

Validate both the HTTP payload and response at the TypeSafe boundary. Keep
live-model assertions separate from deterministic tests: adapter and security
tests use fixtures, while optional integration tests record that returned
choices, probabilities, and confidence conform to the contract without
requiring exact probability values.

Verify:

```text
Human player vs TypeSafe AI
```

can complete an entire hand. Automated integration tests may drive the human seat with a fixed legal-action strategy.

---

## Phase 6 — UI

Build:

* poker table
* cards
* stacks
* pot
* action history
* AI probability panel
* legal human action controls
* bet/raise sizing control
* New Game

Prioritize clarity over graphics.

Define and consume only sanitized public API DTOs. The UI must not receive the
engine's raw state, persisted AI state, or raw AI response during an active
hand. Use route responses as the source of truth after every mutation and
disable controls until their request completes.

---

## Phase 7 — AI inspection

Add:

```text
View state sent to TypeSafe
View raw TypeSafe result
```

Add a `/history` or hand-history view if convenient.

Allow previous AI decisions to be inspected.

---

## Phase 8 — Realtime

Only after the normal HTTP flow works correctly, optionally add Supabase Realtime.

Do not change the authoritative state architecture.

Realtime should distribute changes, not become the source of truth.

---

# Testing

At minimum add tests for:

```text
AI cannot choose an unavailable action

Human cannot submit an unavailable action

Human cannot act out of turn

Stale human actions are rejected by version

Raise amount cannot be below minimum

Raise amount cannot exceed stack / legal max

Opponent cards are not included in PokerAIState

AI hole cards are not returned through public game API before showdown

AI state and raw response are not returned before the hand completes

Actions are applied exactly once

AI probabilities are persisted

Game reaches flop

Game reaches turn

Game reaches river

Game reaches showdown

Fold ends hand

All-in works

New hand resets board/cards correctly
```

Also create fixed poker scenarios for testing TypeSafe.

For example:

### Obvious fold

Weak hand facing a very large river bet.

Expected behavior:

```text
fold should receive significant probability
```

Do NOT write a brittle test requiring an exact probability.

### Strong continue/aggression

Very strong made hand facing a reasonable bet.

Expected behavior:

```text
fold probability should generally be low
```

Again, do not require exact TypeSafe output.

Tests of poker correctness should be deterministic.

Tests of AI behavior should record/inspect responses without assuming the model always returns an identical probability.

Phase-gate the test suite: Phase 2 requires adapter tests; Phase 3 requires
persistence and compare-and-swap tests; Phase 4 requires request validation and
full deterministic-hand tests; Phase 5 requires TypeSafe response-validation
and audit-persistence tests; Phase 6 requires public-projection tests proving
private cards and AI data remain hidden until hand completion.

---

# UX Goal

The demo should communicate this idea within a few seconds:

```text
The application has structured state.

              ↓

TypeSafe evaluates that state.

              ↓

It returns a constrained typed decision
plus probability distribution.

              ↓

Normal application code validates
and executes that decision.

              ↓

The state changes and the process repeats.
```

TypeSafe should feel like a decision-making component inside normal application architecture, not like a chatbot playing poker.

---

# Definition of Done for MVP

The MVP is complete when I can:

1. open the deployed Vercel application,
2. click `New Game`,
3. see my human seat playing heads-up Texas Hold'em against TypeSafe AI,
4. choose from legal poker actions and valid bet/raise amounts,
5. watch hands progress from preflop through showdown,
6. see TypeSafe's selected action,
7. see probability values for every available action,
8. see confidence,
9. inspect the exact state given to TypeSafe after the hand completes,
10. see historical actions,
11. refresh the browser without losing the game because state is in Supabase,
12. play multiple consecutive hands,
13. inspect stored AI decisions afterward.

---

# Implementation Principles

While building this:

* Prefer simple code over abstractions we do not yet need.
* Use strict TypeScript.
* Do not use `any` unless unavoidable at a third-party boundary.
* Validate external API responses.
* Keep poker-engine-specific types inside the poker adapter.
* Keep TypeSafe calls server-side.
* Keep Supabase database code separate from game logic.
* Never expose hidden cards.
* Never allow AI output to bypass poker-engine validation.
* Never allow browser-submitted human actions to bypass poker-engine validation.
* Model turn ownership by player/controller so more humans and multiple TypeSafe bots can be added without rewriting poker rules.
* Keep the application deployable to Vercel at every phase.
* Build and test incrementally.
* Do not implement features outside the MVP unless required for correctness.

Before implementing each major integration, inspect the current documentation/package typings rather than guessing APIs.

Start with **Phase 1 and Phase 2 only**. Once the poker engine can successfully run a complete heads-up hand locally, proceed to Supabase and TypeSafe integration.
