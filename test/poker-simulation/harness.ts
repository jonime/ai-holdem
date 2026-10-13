import assert from "node:assert/strict";
import { pokerEngineAdapter as adapter } from "../../lib/poker/adapter";
import { restorePersistedState } from "../../lib/poker/persisted-state";
import { publicProjectionForViewer } from "../../lib/poker/game-projection";
import type { GameConfig, LegalAction, PokerAction, PokerGameState } from "../../lib/poker/types";
import { accountingFacts } from "./adapter-facts";
import { deriveSeed, seededRandom, shuffledDeck } from "./random";

export interface SimulationCase { seed: number; seats: number; hands: number }
export interface TraceAction { hand: number; index: number; actor: string; action: PokerAction; policy: "generated" | "passive-after-64" | "fixture" }

export function syntheticConfig(stacks: readonly number[]): GameConfig {
  return { smallBlind: 5, bigBlind: 10, seatCount: stacks.length,
    players: stacks.map((stack, seat) => ({
      id: `synthetic-${seat}`, name: `Simulation ${seat}`, seat, stack,
      controller: seat % 2 === 0 ? "human" : "bot",
      status: seat % 2 === 0 ? "claimed" : "bot",
      playerToken: seat % 2 === 0 ? `synthetic-owner-${seat}` : null,
      bot: seat % 2 === 0 ? null : { id: "simulation-rules", label: "Synthetic rules", provider: "rules", modelId: "offline" },
    })) };
}

export function generatedConfig(testCase: SimulationCase) {
  const random = seededRandom(deriveSeed(testCase.seed, testCase.seats, 0, "stacks"));
  // First seat is deliberately below a blind; others cover 1–100 BB with integer uneven stacks.
  return syntheticConfig(Array.from({ length: testCase.seats }, (_, i) =>
    i === 0 ? 1 + Math.floor(random() * 9) : 10 + Math.floor(random() * 991)));
}

export function actionChoices(legal: readonly LegalAction[]): PokerAction[] {
  return legal.flatMap<PokerAction>(action => action.type === "bet" || action.type === "raise"
    ? [...new Set([action.minAmount, Math.floor((action.minAmount + action.maxAmount) / 2), action.maxAmount])]
      .map(amount => ({ type: action.type, amount }))
    : [action]);
}

export function selectAction(legal: readonly LegalAction[], index: number, random: () => number) {
  if (index >= 64) {
    const action = legal.find(a => a.type === "check") ?? legal.find(a => a.type === "call");
    assert(action, "Passive termination policy requires check or call");
    return { action, policy: "passive-after-64" as const };
  }
  const choices = actionChoices(legal);
  assert(choices.length > 0, "No legal choices");
  return { action: choices[Math.floor(random() * choices.length)], policy: "generated" as const };
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const roundTrip = (state: PokerGameState) => restorePersistedState(JSON.parse(JSON.stringify(state)));

function assertTransition(state: PokerGameState, initialChips: number) {
  const facts = accountingFacts(state);
  const snapshot = adapter.snapshot(state);
  const legal = adapter.getLegalActions(state);
  for (const value of facts.chipValues) assert(Number.isSafeInteger(value) && value >= 0, `Invalid chip value ${value}`);
  assert.equal(sum(Object.values(facts.stacks)) + (facts.complete ? 0 : sum(facts.players.map(p => p.committed))), initialChips, "Chip conservation");
  if (snapshot.street !== null && !facts.complete) {
    assert(snapshot.currentActorId, "Active decision has no actor");
    assert(legal.length > 0, "Active decision has no legal actions");
  } else {
    assert.equal(snapshot.currentActorId, null);
    assert.deepEqual(legal, []);
  }
  for (const action of legal) {
    if (action.type === "call") assert(Number.isSafeInteger(action.amount) && action.amount >= 0);
    if (action.type === "bet" || action.type === "raise") {
      assert(Number.isSafeInteger(action.minAmount) && action.minAmount >= 0);
      assert(Number.isSafeInteger(action.maxAmount) && action.maxAmount >= action.minAmount);
    }
  }
  const awards: Record<string, number> = {};
  for (const pot of facts.pots) {
    for (const award of pot.awards) awards[award.playerId] = (awards[award.playerId] ?? 0) + award.amount;
    if (facts.complete) assert.equal(sum(pot.awards.map(a => a.amount)), pot.amount, "Pot awards settle exactly");
  }
  assert.deepEqual(snapshot.winnerAmounts, awards);
  assert.deepEqual(snapshot.winnerIds, [...new Set(facts.pots.flatMap(p => p.winnerPlayerIds))]);
  assert.equal(snapshot.pot, facts.complete ? sum(facts.pots.map(p => p.amount)) : sum(facts.players.map(p => p.committed)));
  if (facts.complete) {
    const baseline = state.handStartStacks;
    assert(baseline);
    assert.equal(baseline.handNumber, snapshot.handNumber);
    assert.equal(sum(facts.players.map(p => facts.stacks[p.id] - baseline.stacks[p.id])), 0, "Personal net changes sum to zero");
  }
}

function assertViewers(state: PokerGameState, restored: PokerGameState) {
  const before = JSON.stringify(state);
  const restoredBefore = JSON.stringify(restored);
  const facts = accountingFacts(state);
  const snapshot = adapter.snapshot(state);
  const owners = state.config.players.filter(p => p.controller === "human");
  const viewers = [null, "synthetic-unknown", ...owners.map(p => p.playerToken!)];
  const revealSets = facts.complete ? [[], facts.players.map(p => p.id)] : [[]];
  const spectatorBefore = publicProjectionForViewer(state, null);
  for (const reveals of revealSets) for (const token of viewers) {
    const owner = owners.find(p => p.playerToken === token);
    const view = publicProjectionForViewer(state, token, reveals);
    assert.deepEqual(view, publicProjectionForViewer(restored, token, reveals), "Restored viewer projection");
    assert.equal(view.pot, snapshot.pot);
    assert.deepEqual(view.winnerAmounts, snapshot.winnerAmounts);
    assert.deepEqual(view.legalActions, owner?.id === snapshot.currentActorId ? adapter.getLegalActions(state) : []);
    for (const player of view.players) {
      const source = facts.players.find(p => p.id === player.id);
      const isOwner = owner?.id === player.id;
      const publicCards = Boolean(source && facts.complete && (reveals.includes(player.id) || (snapshot.completionReason === "showdown" && !source.folded)));
      assert.equal(player.stack, facts.stacks[player.id]);
      assert.equal(player.allIn, source?.allIn ?? false);
      assert.equal(player.inHand, Boolean(source), "Unresolved zero-stack all-ins retain participation");
      assert.equal(player.playerToken, isOwner ? token : null, "Opponent ownership token hidden");
      assert.deepEqual(player.holeCards, source && (isOwner || publicCards) ? source.cards : null, "Card visibility");
      assert.equal(player.cardsRevealed, publicCards);
      const categoryVisible = isOwner && source && !source.folded &&
        ["flop", "turn", "river"].includes(snapshot.street ?? "");
      assert.equal(player.currentHandCategory, categoryVisible ? adapter.describePlayerHand(state, player.id).madeHand : null, "Private category visibility");
      const showdown = facts.complete && snapshot.completionReason === "showdown" && source && !source.folded;
      assert.equal(player.bestHand, showdown ? source.category : null);
      if (!showdown || !snapshot.winnerIds.includes(player.id)) assert.equal(player.winningHand, null);
      else {
        assert(player.winningHand, "Showdown winner has public winning cards");
        assert.equal(player.winningHand.cards.length, 5);
        assert.equal(new Set(player.winningHand.cards).size, 5);
        assert(player.winningHand.cards.every(card => [...source.cards, ...snapshot.communityCards].includes(card)));
      }
    }
    const baseline = owner && state.handStartStacks?.stacks[owner.id];
    assert.deepEqual(view.viewerHandResult, facts.complete && owner && baseline !== undefined && facts.players.some(p => p.id === owner.id)
      ? { startStack: baseline, endStack: facts.stacks[owner.id], netChange: facts.stacks[owner.id] - baseline } : null);
    assert.equal(JSON.stringify(state), before, "Projection mutated uninterrupted state");
    assert.equal(JSON.stringify(restored), restoredBefore, "Projection mutated restored state");
  }
  assert.deepEqual(publicProjectionForViewer(state, null), spectatorBefore, "Other viewers affect spectator");
}

export function failureDiagnostic(testCase: SimulationCase, config: GameConfig, hand: number, index: number, trace: readonly TraceAction[], fixture?: string) {
  return `Poker simulation failed: seed=${testCase.seed} seats=${testCase.seats} hand=${hand} action=${index}${fixture ? ` fixture=${fixture}` : ""}\n` +
    `Synthetic configuration: ${JSON.stringify(config)}\nOrdered actions: ${JSON.stringify(trace)}\n` +
    `Reproduce: npm run test:poker:simulation -- --seed ${testCase.seed} --seats ${testCase.seats} --hands ${testCase.hands}${fixture ? `\nFixture: test/poker-simulation/full-game.test.ts (${fixture}; always runs with command)` : ""}`;
}

export interface Fixture {
  name: string;
  config: GameConfig;
  deck?: Parameters<typeof adapter.startHand>[1];
  choose: (state: PokerGameState, index: number, hand: number) => PokerAction;
  observe?: (state: PokerGameState, index: number, hand: number) => void;
}

export function simulate(testCase: SimulationCase, fixture?: Fixture) {
  const config = fixture?.config ?? generatedConfig(testCase);
  const initialChips = sum(config.players.map(p => p.stack));
  const trace: TraceAction[] = [];
  const decks: NonNullable<Parameters<typeof adapter.startHand>[1]>[] = [];
  let hand = 0;
  let index = 0;
  let state: PokerGameState;
  try {
    state = adapter.createGame(config);
    let restored = roundTrip(state);
    const verify = () => {
      assert.deepEqual(restored, state, "Restored raw state");
      assert.deepEqual(adapter.snapshot(restored), adapter.snapshot(state));
      assert.deepEqual(adapter.getLegalActions(restored), adapter.getLegalActions(state));
      assert.deepEqual(restored.handStartStacks, state.handStartStacks);
      assertTransition(state, initialChips);
      assertTransition(restored, initialChips);
      assertViewers(state, restored);
      fixture?.observe?.(state, index, hand);
    };
    verify();
    for (hand = 1; hand <= testCase.hands; hand++) {
      if (Object.values(accountingFacts(state).stacks).filter(stack => stack > 0).length < 2) break;
      index = 0;
      const deck = fixture?.deck ?? shuffledDeck(deriveSeed(testCase.seed, testCase.seats, hand, "deck"));
      decks.push(deck);
      const beforeStacks = accountingFacts(state).stacks;
      state = adapter.startHand(state, deck);
      assert.deepEqual(state.handStartStacks?.stacks, Object.fromEntries(accountingFacts(state).players.map(p => [p.id, beforeStacks[p.id]])), "Baseline uses pre-blind funded stacks");
      restored = roundTrip(adapter.startHand(roundTrip(restored), deck));
      verify();
      const random = seededRandom(deriveSeed(testCase.seed, testCase.seats, hand, "actions"));
      while (adapter.snapshot(state).street !== "complete") {
        assert(index < 128, "Hand did not finish within 128 actions");
        const actor = adapter.snapshot(state).currentActorId!;
        const selection = fixture && index < 64 ? { action: fixture.choose(state, index, hand), policy: "fixture" as const }
          : selectAction(adapter.getLegalActions(state), index, random);
        const legal = adapter.getLegalActions(state).find(a => a.type === selection.action.type);
        assert(legal, "Selected action type must be adapter legal");
        if (selection.action.type === "bet" || selection.action.type === "raise") {
          assert(legal.type === "bet" || legal.type === "raise");
          assert(Number.isSafeInteger(selection.action.amount) && selection.action.amount >= legal.minAmount && selection.action.amount <= legal.maxAmount);
        }
        trace.push({ hand, index, actor, ...selection });
        const previous = JSON.stringify(state);
        state = adapter.applyAction(state, actor, selection.action);
        restored = roundTrip(adapter.applyAction(roundTrip(restored), actor, selection.action));
        assert.notEqual(JSON.stringify(state), previous, "Action made no progress");
        index++;
        verify();
      }
    }
    return { state, trace, decks };
  } catch (error) {
    throw new Error(failureDiagnostic(testCase, config, hand, index, trace, fixture?.name), { cause: error });
  }
}
