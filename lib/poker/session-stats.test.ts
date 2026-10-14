import { describe, expect, it } from "vitest";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "./adapter";
import { projectSessionStats, type BotSessionContext } from "./session-stats";
import type { BotHandContext } from "./bot-history";
import type { PokerAction, PokerGameState } from "./types";

function fixture(hands = 1, seats = 2) {
  let state = engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: seats,
    players: Array.from({ length: seats }, (_, seat) => ({ id: `p${seat}`, seat, name: "Same", controller: "human" as const, stack: 1000, playerToken: `secret-${seat}` })) });
  const previousHands: BotHandContext[] = [];
  for (let hand = 0; hand < hands; hand++) {
    state = engine.startHand(state, createDeterministicDeck());
    const initialState = state;
    const actions: { sequence: number; action: PokerAction; stateBefore: PokerGameState }[] = [];
    while (engine.snapshot(state).street !== "complete") {
      const view = engine.decisionView(state);
      const actor = view.players.find(player => player.seat === view.currentActorSeat)!;
      const legal = engine.getLegalActions(state);
      const action: PokerAction = actions.length === 0 ? { type: "raise", amount: 6 } : { type: "fold" };
      expect(legal.some(candidate => candidate.type === action.type)).toBe(true);
      actions.push({ sequence: actions.length + 1, action, stateBefore: state });
      state = engine.applyAction(state, actor.id, action);
    }
    previousHands.push({ version: 1, handNumber: hand + 1, initialState, actions, finalState: state });
  }
  state = engine.startHand(state, createDeterministicDeck());
  const session: BotSessionContext = { gameId: "game", version: 1, currentHand: { version: 1, handNumber: hands + 1, initialState: state, actions: [] }, previousHands };
  return { state, session };
}

describe("private session aggregation", () => {
  it("counts real opportunities, shows zero as unknown and marks sparse evidence", () => {
    const { state, session } = fixture();
    const stats = projectSessionStats(session, state, "p0");
    expect(stats.coverage).toMatchObject({ status: "complete", selectedHands: 1, validatedHands: 1 });
    const hero = stats.participants.find(player => player.role === "hero")!;
    expect(hero.headsUp.vpip).toEqual({ count: 1, opportunities: 1, rate: 1, evidence: "insufficient" });
    expect(hero.headsUp.buttonOpenRaise.count).toBe(1);
    expect(hero.headsUp.flopAggression).toEqual({ count: 0, opportunities: 0, rate: null, evidence: "unknown" });
    expect(stats.participants[1].headsUp.bbSmallOpenFold).toMatchObject({ count: 1, opportunities: 1 });
    expect(JSON.stringify(stats)).not.toMatch(/secret|holeCards|engineState|playerToken|p0/);
  });
  it("marks ten opportunities as observed, without a certainty claim", () => {
    const { state, session } = fixture(20);
    expect(projectSessionStats(session, state, "p0").participants[0].headsUp.buttonOpenRaise.evidence).toBe("observed");
  });
  it("separates three-player hands reduced to two from hands dealt heads-up", () => {
    const { state, session } = fixture(1, 3);
    const stats = projectSessionStats(session, state, "p0");
    expect(stats.participants[0].multiway.vpip.opportunities).toBe(1);
    expect(stats.participants[0].headsUp.vpip.opportunities).toBe(0);
  });
  it("stops attribution across an ownership change even with identical name, seat and engine ID", () => {
    const { state, session } = fixture(3);
    const changed = { ...state, config: { ...state.config, players: state.config.players.map(player => player.id === "p0" ? { ...player, playerToken: "new-owner" } : player) } };
    expect(projectSessionStats(session, changed, "p0").participants[0].headsUp.vpip.opportunities).toBe(0);
    expect(projectSessionStats(session, changed, "p0").participants[1].headsUp.vpip.opportunities).toBe(3);
  });
  it("does not resurrect older observations after a missing hand or unknown ownership", () => {
    const { state, session } = fixture(3);
    const missing = { ...session, previousHands: session.previousHands.filter(hand => hand.handNumber !== 2) };
    const stats = projectSessionStats(missing, state, "p0");
    expect(stats.coverage.status).toBe("incomplete");
    expect(stats.participants[0].headsUp.vpip.opportunities).toBe(1);
    expect(projectSessionStats(null, state, "p0").coverage.status).toBe("incomplete");
  });
  it("excludes identifiable forced departures and does not infer why other folds occurred", () => {
    const { state, session } = fixture();
    const hand = session.previousHands[0];
    const forced = { ...session, previousHands: [{ ...hand, actions: hand.actions.map((action, index) => ({ ...action, forcedDeparture: index === 1 })) }] };
    expect(projectSessionStats(forced, state, "p0").participants[1].headsUp.bbSmallOpenFold.opportunities).toBe(0);
    expect(projectSessionStats(session, state, "p0").participants[1].headsUp.bbSmallOpenFold.count).toBe(1);
  });
  it("makes incomplete legacy history explicit and rejects invalid replay and oversized windows", () => {
    const { state, session } = fixture();
    const hand = session.previousHands[0];
    expect(projectSessionStats({ ...session, previousHands: [{ ...hand, initialState: null }] }, state, "p0").coverage.excludedHands).toBe(1);
    expect(() => projectSessionStats({ ...session, previousHands: [{ ...hand, actions: [{ ...hand.actions[0], action: { type: "check" } }] }] }, state, "p0")).toThrow();
    expect(() => projectSessionStats({ ...session, previousHands: Array(51).fill(hand) }, state, "p0")).toThrow();
  });
});

it("counts postflop aggression and faced-bet folds per street without private-card judgments", () => {
  let state = engine.startHand(engine.createGame({ smallBlind: 1, bigBlind: 2,
    players: [0, 1].map(seat => ({ id: `p${seat}`, seat, name: "Same", controller: "human" as const, stack: 200, playerToken: `secret-${seat}` })) }), createDeterministicDeck());
  const initialState = state;
  const actions: BotHandContext["actions"][number][] = [];
  const play = (action: PokerAction) => {
    actions.push({ sequence: actions.length + 1, action, stateBefore: state });
    state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
  };
  play({ type: "call" }); play({ type: "check" }); // flop
  play({ type: "bet", amount: 2 }); play({ type: "call" }); // turn
  play({ type: "check" }); play({ type: "bet", amount: 4 }); play({ type: "call" }); // river
  play({ type: "bet", amount: 6 }); play({ type: "fold" });
  const hand: BotHandContext = { version: 1, handNumber: 1, initialState, finalState: state, actions };
  state = engine.startHand(state, createDeterministicDeck());
  const session: BotSessionContext = { gameId: "game", version: 1, currentHand: { version: 1, handNumber: 2, initialState: state, actions: [] }, previousHands: [hand] };
  const stats = projectSessionStats(session, state, "p0");
  expect(stats.participants[0].headsUp.flopFoldFacingBet).toMatchObject({ count: 0, opportunities: 1 });
  expect(stats.participants[0].headsUp.riverFoldFacingBet).toMatchObject({ count: 1, opportunities: 1 });
  expect(stats.participants[0].headsUp.turnAggression).toMatchObject({ count: 1, opportunities: 1 });
  expect(stats.participants[1].headsUp.turnAggression).toMatchObject({ count: 0, opportunities: 2 });
});

it("is invariant to historical private cards and resets changed bot configurations", () => {
  const first = fixture();
  const hand = first.session.previousHands[0];
  let alternate = engine.startHand(engine.createGame(hand.initialState!.config), createDeterministicDeck(["7s", "2h", "As", "Kd"]));
  const initialState = alternate;
  const actions = hand.actions.map(item => {
    const before = alternate;
    alternate = engine.applyAction(alternate, engine.snapshot(alternate).currentActorId!, item.action!);
    return { ...item, stateBefore: before };
  });
  const hidden = { ...first.session, previousHands: [{ ...hand, initialState, actions, finalState: alternate }] };
  expect(projectSessionStats(hidden, first.state, "p0")).toEqual(projectSessionStats(first.session, first.state, "p0"));
  const asBots = (state: PokerGameState, model = "one") => ({ ...state, config: { ...state.config,
    players: state.config.players.map(player => ({ ...player, controller: "bot" as const,
      bot: { id: "llm", label: "Same", provider: "llm" as const, modelId: model }, aiDifficulty: null, botProfileId: "balanced" as const })) } });
  const bots = { ...first.session, previousHands: [{ ...hand, initialState: asBots(hand.initialState!), finalState: asBots(hand.finalState!),
    actions: hand.actions.map(item => ({ ...item, stateBefore: asBots(item.stateBefore!) })) }] };
  expect(projectSessionStats(bots, asBots(first.state), "p0").participants[0].headsUp.vpip.opportunities).toBe(1);
  expect(projectSessionStats(bots, asBots(first.state, "two"), "p0").participants[0].headsUp.vpip.opportunities).toBe(0);
});
