import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { projectSessionStats } from "@/lib/poker/session-stats";
import type { BotHandContext } from "@/lib/poker/bot-history";
import type { PokerAction } from "@/lib/poker/types";
import type { BotContext } from "@/lib/bots/types";
import { evaluationContext } from "../poker-context-harness";

export const fixtureVersion = "opponent-advice-twelve-v1";
export const conditions = ["omitted", "insufficient", "folding", "continuation"] as const;
export type Condition = typeof conditions[number];
const nodes = ["preflop-small", "preflop-large", "flop-draw", "flop-made", "turn", "river"] as const;
export function recordedHistory(seats: number, street: string, target: number, kind: Exclude<Condition, "omitted">, open: number, hiddenPrefix: readonly string[] = []) {
  let state = engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: seats,
    players: Array.from({ length: seats }, (_, seat) => ({ id: `p${seat}`, name: "Fixture", seat, controller: "human", playerToken: `fixture-${seat}`, stack: 10000 })) });
  const hands: BotHandContext[] = [];
  for (let n = 0; n < 42; n++) {
    state = { ...state, config: { ...state.config, players: state.config.players.map(p => p.seat === target ? { ...p, playerToken: kind === "insufficient" && n < 38 ? "previous-owner" : `fixture-${target}` } : p) } };
    state = engine.startHand(state, createDeterministicDeck(hiddenPrefix));
    const initialState = state, actions: BotHandContext["actions"][number][] = [];
    let pressured = false;
    while (engine.snapshot(state).street !== "complete") {
      const view = engine.decisionView(state), legal = engine.getLegalActions(state);
      const call = legal.find(a => a.type === "call");
      let action: PokerAction = call?.type === "call" ? { type: "call", amount: call.amount } : { type: "check" };
      if (view.street === "preflop" && street === "preflop" && !actions.length) action = { type: "raise", amount: open };
      else if (view.street === street && view.currentActorSeat !== target && !pressured && legal.some(a => a.type === "bet")) { action = { type: "bet", amount: 4 }; pressured = true; }
      if (view.street === street && view.currentActorSeat === target && call && kind === "folding") action = { type: "fold" };
      actions.push({ sequence: actions.length + 1, action, stateBefore: state });
      state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
      if (actions.length > 150) throw new Error("Fixture action bound");
    }
    hands.push({ version: 0, handNumber: n + 1, initialState, actions, finalState: state });
  }
  return { state, hands };
}
export function adviceFixtures(samples = 5000, hiddenCards?: readonly string[]) {
  return [2, 3].flatMap(seats => nodes.map(node => {
    const street = node.split("-")[0], open = node === "preflop-large" ? 10 : 6;
    const probe = engine.startHand(engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: seats,
      players: Array.from({ length: seats }, (_, seat) => ({ id: `p${seat}`, name: "Fixture", seat, controller: "human", stack: 10000, playerToken: `fixture-${seat}` })) }), createDeterministicDeck());
    const target = street === "preflop" ? engine.decisionView(probe).bigBlindSeat : engine.decisionView(probe).postflopOrder[1];
    const sources = Object.fromEntries((["insufficient", "folding", "continuation"] as const).map(kind => [kind, recordedHistory(seats, street, target, kind, open)])) as Record<Exclude<Condition, "omitted">, ReturnType<typeof recordedHistory>>;
    // One canonical decision keeps cards, stacks, price and line identical across conditions.
    const waiting = sources.folding.state;
    const order = engine.decisionView(probe).postflopOrder;
    const heroSeat = street === "preflop" ? engine.decisionView(probe).preflopOrder[0] : order[0];
    const cards = node === "flop-made" ? ["As", "Ah"] : node === "preflop-large" ? ["7s", "2h"] : ["Js", "Ts"];
    const board = ["9s", "8s", "2c", "3d", "Qh"];
    const burns = ["4c", "5c", "6c"];
    const available = createDeterministicDeck().map(c => c.rank + c.suit).filter(c => ![...cards, ...board, ...burns, ...(hiddenCards ?? [])].includes(c));
    const prefix = [0, 1].flatMap(round => order.map(seat => seat === heroSeat ? cards[round] : seat === target && hiddenCards ? hiddenCards[round] : available.shift()!));
    prefix.push(burns[0], ...board.slice(0, 3), burns[1], board[3], burns[2], board[4]);
    let state = engine.startHand(waiting, createDeterministicDeck(prefix));
    const initialState = state, actions: BotHandContext["actions"][number][] = [];
    while (engine.snapshot(state).street !== street) {
      const legal = engine.getLegalActions(state), call = legal.find(a => a.type === "call");
      const action: PokerAction = call?.type === "call" ? { type: "call", amount: call.amount } : { type: "check" };
      actions.push({ sequence: actions.length + 1, action, stateBefore: state });
      state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
    }
    const currentHand = { version: 0, handNumber: 43, initialState, actions };
    const hero = engine.snapshot(state).currentActorId!;
    const base = evaluationContext(state, currentHand, "facts", samples);
    const projected = (kind: Exclude<Condition, "omitted">) => projectSessionStats({ gameId: "advice-fixture", version: 0, currentHand, previousHands: sources[kind].hands }, state, hero);
    const canonical = projected("folding");
    // Unrelated opponents have a fixed unknown control; HERO's validated image is fixed.
    const unknown = projectSessionStats(null, state, hero);
    const contexts = Object.fromEntries(conditions.map(kind => [kind, kind === "omitted" ? base : { ...base, sessionStats: { ...canonical,
      participants: canonical.participants.map(p => p.seat === target ? projected(kind).participants.find(q => q.seat === target)! : p.role === "hero" ? p : unknown.participants.find(q => q.seat === p.seat)!) } }])) as Record<Condition, BotContext>;
    return { id: `${seats === 2 ? "HU" : "MW"}-${node}`, node, target, state, currentHand, contexts, sources };
  }));
}
