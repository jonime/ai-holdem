import { describe, expect, it } from "vitest";
import { createDeterministicDeck, pokerEngineAdapter } from "./adapter";
import { createPokerAIState } from "./ai-state";
import { BotHistoryConflictError, projectBotHistory, type BotHandContext } from "./bot-history";
import { analyzePokerDecision } from "./decision-facts";
import { prepareProviderContext } from "./provider-context";
import { createSizingOptions } from "@/lib/typesafe/questions";
import type { PokerAction, PokerGameState } from "./types";

function start(seats = [0,1,2,3,4,5], button: number | null = null) {
  const waiting = pokerEngineAdapter.createGame({ smallBlind: 1, bigBlind: 2, seatCount: 6,
    players: seats.map(seat => ({ id: `p${seat}`, seat, name: "Duplicate", controller: "bot", stack: 200 })) });
  // Rotate the engine's prior button; startHand chooses the next eligible seat.
  const engine = waiting.engineState as Record<string, unknown>;
  return pokerEngineAdapter.startHand({ ...waiting, engineState: { ...engine, buttonSeat: button } }, createDeterministicDeck());
}
function context(state: PokerGameState, history: BotHandContext) {
  const actor = pokerEngineAdapter.snapshot(state).currentActorId!;
  const projected = projectBotHistory(history, state, actor);
  const ai = createPokerAIState(state, actor, { correctedContext: true, equitySamples: 5,
    decisionHistory: projected.actions, historyStatus: projected.status });
  return prepareProviderContext({ ...ai, sizingOptions: createSizingOptions(ai) });
}
function play(initial: PokerGameState, moves: readonly PokerAction[]) {
  let state = initial;
  const history: BotHandContext = { version: 1, handNumber: 1, initialState: initial, actions: [] };
  const actions: { sequence: number; action: PokerAction; stateBefore: PokerGameState }[] = [];
  for (const action of moves) {
    const before = state;
    const actor = pokerEngineAdapter.snapshot(before).currentActorId!;
    state = pokerEngineAdapter.applyAction(before, actor, action);
    actions.push({ sequence: actions.length + 1, action, stateBefore: before });
  }
  return { state, history: { ...history, actions } };
}

describe("shared decision context", () => {
  it.each([2,3,4,5,6])("maps every position at %i seats and every button rotation", count => {
    const expected = ["button", "big_blind", ...(count >= 3 ? ["small_blind"] : []),
      ...(count >= 4 ? ["cutoff"] : []), ...(count >= 5 ? ["hijack"] : []), ...(count >= 6 ? ["UTG"] : [])].sort();
    for (let previous = 0; previous < count; previous++) {
      const view = pokerEngineAdapter.decisionView(start(Array.from({ length: count }, (_,i) => i), previous));
      expect(view.players.map(p => p.position).sort()).toEqual(expected);
      const button = view.players.find(p => p.position === "button")!;
      expect(button.seat).toBe((previous+1)%count);
      if (count === 2) {
        expect(view.smallBlindSeat).toBe(button.seat);
        expect(view.preflopOrder[0]).toBe(button.seat);
        expect(view.postflopOrder.at(-1)).toBe(button.seat);
      }
    }
  });
  it("uses dealt players at sparse seats, retaining folded positions", () => {
    const initial = start([0,2,4,5]);
    const { state } = play(initial, [{ type: "fold" }]);
    const before = pokerEngineAdapter.decisionView(initial), after = pokerEngineAdapter.decisionView(state);
    expect(after.players.map(p => p.position)).toEqual(before.players.map(p => p.position));
    expect(after.players).toHaveLength(4);
  });
  it("recognizes unopened after folds, limps, blind completion, raises and re-raises", () => {
    const initial = start();
    let run = play(initial, [{ type: "fold" }]);
    expect(context(run.state, run.history).situation?.preflop).toBe("unopened");
    const choices = context(run.state, run.history).sizingOptions;
    expect(choices.map(c => c.amount)).toEqual([4,5,6,200]);
    run = play(initial, [{ type: "call", amount: 2 }]);
    expect(context(run.state, run.history).situation?.preflop).toBe("limped");
    run = play(initial, [{ type: "raise", amount: 6 }, { type: "raise", amount: 18 }]);
    expect(context(run.state, run.history).situation?.preflop).toBe("re-raised");
    const hu = play(start([0,1]), [{ type: "call", amount: 1 }]);
    expect(context(hu.state, hu.history).situation?.preflop).toBe("limped");
  });
  it("projects duplicate names from authoritative actors and never leaks private states", () => {
    const run = play(start(), [{ type: "raise", amount: 6 }, { type: "call", amount: 6 }]);
    const ctx = context(run.state, run.history);
    expect(ctx.actionHistory.map(e => e.actorSeat)).toEqual([3,4]);
    expect(ctx.actionHistory[0]).toMatchObject({ payment: 6, commitment: 6, potBefore: 3, potAfter: 9,
      raiseIncrement: 4, pressureRatio: 4/5 });
    const serialized = JSON.stringify(ctx);
    for (const field of ["engineState", "deck", "stateBefore", "initialState", "playerToken", "Duplicate"]) expect(serialized).not.toContain(field);
    const hidden = pokerEngineAdapter.heroCards(run.state, "p3");
    hidden.forEach(card => expect(serialized).not.toContain(`"${card}"`));
  });
  it("uses live pot and pays the call only once in exact sizing descriptions", () => {
    const run = play(start(), [{ type: "raise", amount: 6 }]);
    const ctx = context(run.state, run.history);
    expect(ctx.hand.pot).toBe(9);
    expect(ctx.hero.amountToCall).toBe(6);
    const size = ctx.sizingOptions.find(s => s.choice === "full_pot")!;
    expect(size.amount).toBe(21);
    expect(size.description).toContain("pay 21 additional chips");
    expect(size.description).toContain("30 chips in the middle");
  });
  it("validates JSONB-shaped states independently of object key order", () => {
    const run=play(start(),[{ type:"raise",amount:6 },{ type:"call",amount:6 }]);
    const reorder=(value:unknown):unknown => Array.isArray(value) ? value.map(reorder) : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => b.localeCompare(a)).map(([key,item]) => [key,reorder(item)])) : value;
    const decision=pokerEngineAdapter.restore({ ...run.state,engineState:reorder(run.state.engineState) });
    expect(projectBotHistory(run.history,decision,"p5").status).toBe("complete");
  });
  it("reports incomplete legacy history as unknown and rejects stale/cross-hand history", () => {
    const initial = start();
    const run = play(initial, [{ type: "raise", amount: 6 }]);
    expect(projectBotHistory({ ...run.history, actions: [{ ...run.history.actions[0], stateBefore: null }] }, run.state, "p4").status).toBe("unknown");
    expect(projectBotHistory(null, initial, "p3").status).toBe("unknown");
    expect(() => projectBotHistory({ ...run.history, actions: [] }, run.state, "p4")).toThrow(BotHistoryConflictError);
    expect(() => projectBotHistory({ ...run.history, handNumber: 2 }, run.state, "p4")).toThrow(BotHistoryConflictError);
    expect(() => projectBotHistory({ ...run.history, initialState: start([0,1]) }, run.state, "p4")).toThrow();
  });
  it("clamps and deduplicates sizes while reserving maximum commitment", () => {
    const ctx = context(start(), { version: 1, handNumber: 1, initialState: start(), actions: [] });
    const small = { ...ctx, legalActions: [{ type: "raise", minAmount: 4, maxAmount: 5 }] as const };
    expect(createSizingOptions(small).map(s => [s.choice,s.amount])).toEqual([["two_big_blinds",4],["all_in",5]]);
  });
});

function visible(hole: readonly string[], board: readonly string[]) {
  const initial = start([0,1]);
  const ai = createPokerAIState(initial, "p0", { equitySamples: 5 });
  return analyzePokerDecision({ ...ai, hero: { ...ai.hero, holeCards: hole },
    hand: { ...ai.hand, communityCards: board, street: board.length === 5 ? "river" : board.length === 4 ? "turn" : "flop" } });
}
describe("verified visible-card facts", () => {
  it("distinguishes flush, flush draw, backdoor and river suppression", () => {
    expect(visible(["As","Ks"],["2s","7s","Jh"]).draws.flushDrawSuits).toEqual(["s"]);
    expect(visible(["As","Ks"],["2s","7h","Jh"]).draws.backdoorFlushSuits).toEqual(["s"]);
    expect(visible(["As","Ks"],["2s","7s","Js"]).draws.flushDrawSuits).toEqual([]);
    const river = visible(["As","Ks"],["2s","7s","Jh","Td","3c"]);
    expect(river.draws.flushDrawSuits).toEqual([]);
    expect(river.draws.straightCompletionRanks).toEqual([]);
    expect(river.draws.backdoorStraight).toBe(false);
  });
  it("finds wheel, gutshot, and open-ended completions", () => {
    expect(visible(["As","2h"],["3d","4c","Kh"]).draws.straightCompletionRanks).toEqual(["5"]);
    expect(visible(["7s","8h"],["9d","Tc","Kh"]).draws.straightCompletionRanks).toEqual(["6","J"]);
    expect(visible(["7s","8h"],["Td","Jc","Kh"]).draws.straightCompletionRanks).toEqual(["9"]);
    expect(visible(["As","2h"],["3d","4c","5h"]).draws.straightCompletionRanks).toEqual([]);
  });
  it("describes board-only strength, kickers, and starting hands", () => {
    const royal = visible(["2s","3h"],["As","Ks","Qs","Js","Ts"]);
    expect(royal.madeHand.boardOnly).toBe(true);
    expect(royal.madeHand.category).toBe("straight-flush");
    const quads = visible(["As","3h"],["7s","7h","7d","7c","2s"]);
    expect(quads.madeHand.rankAndKickerValues).toEqual([7,14]);
    expect(quads.madeHand.boardOnly).toBe(false);
    expect(visible(["As","Ks"],[]).startingHand.notation).toBe("AKs");
    expect(visible(["Ah","As"],[]).startingHand.notation).toBe("AA");
  });
  it("recognizes action lines and keeps pressure events by opponent/street", () => {
    const run = play(start([0,1]), [{ type:"raise",amount:6 }, { type:"call",amount:4 },
      { type:"check" }, { type:"bet",amount:6 }, { type:"call",amount:6 },
      { type:"check" }, { type:"bet",amount:12 }]);
    const ctx = context(run.state, run.history);
    expect(ctx.facts?.actionLines.flatMap(l => l.labels)).toContain("continuation_bet");
    expect(ctx.facts?.actionLines.flatMap(l => l.labels)).toContain("repeated_barrel");
    const pressure = ctx.facts!.pressure.find(p => p.seat === 0)!;
    expect(pressure.streets.find(s => s.street === "flop")!.events[0].potFraction).toBe(0.5);
    expect(pressure.streets.find(s => s.street === "turn")!.totalPotFractions).toBe(0.5);
  });
  it("suppresses guessed action lines when history is unknown", () => {
    expect(visible(["As","Ks"],["2s","7h","Jh"]).actionLines).toEqual([]);
  });
});

describe("action-line and short-stack regressions", () => {
  it.each([
    [[{ type:"raise",amount:6 },{ type:"call",amount:4 },{ type:"bet",amount:6 }],"donk_bet"],
    [[{ type:"raise",amount:6 },{ type:"call",amount:4 },{ type:"check" },{ type:"bet",amount:6 },{ type:"raise",amount:18 }],"check_raise"],
    [[{ type:"raise",amount:6 },{ type:"call",amount:4 },{ type:"check" },{ type:"check" },{ type:"check" },{ type:"bet",amount:6 }],"delayed_continuation_bet"],
    [[{ type:"raise",amount:6 },{ type:"call",amount:4 },{ type:"check" },{ type:"check" },{ type:"bet",amount:6 }],"probe"],
  ] as const)("recognizes %s", (moves,label) => {
    const run=play(start([0,1]),moves);
    expect(context(run.state,run.history).facts?.actionLines.flatMap(line => line.labels)).toContain(label);
  });
  it("computes raise pressure from increment above calling rather than raise-to total", () => {
    const run=play(start([0,1]),[{ type:"raise",amount:6 },{ type:"call",amount:4 },{ type:"check" },{ type:"bet",amount:6 },{ type:"raise",amount:18 }]);
    const event=context(run.state,run.history).actionHistory.at(-1)!;
    expect(event).toMatchObject({ payment:18,commitment:18,potBefore:18,potAfter:36,raiseIncrement:12,pressureRatio:0.5 });
  });
  it("retains active street participants as opponents fold", () => {
    const run=play(start(),[{ type:"raise",amount:6 },{ type:"fold" },{ type:"raise",amount:18 }]);
    const ctx=context(run.state,run.history);
    expect(ctx.actionHistory[0].activeSeats).toHaveLength(6);
    expect(ctx.actionHistory.at(-1)!.activeSeats).toHaveLength(5);
    expect(ctx.situation?.activeOpponentCount).toBe(4);
  });
  it("maps heads-up after elimination and skips a sitting-out seat", () => {
    const waiting=pokerEngineAdapter.createGame({ smallBlind:1,bigBlind:2,seatCount:6,
      players:[0,2,5].map(seat => ({ id:`p${seat}`,seat,name:"Duplicate",controller:"bot",stack:200 })) });
    // Persisted table fixture models a player sitting out between hands.
    const raw=waiting.engineState as { seats:({ status:string }|null)[] };
    const seats=raw.seats.map((seat,index) => seat && index === 2 ? { ...seat,status:"sitting-out" } : seat);
    const started=pokerEngineAdapter.startHand({ ...waiting,engineState:{ ...raw,seats } },createDeterministicDeck());
    const view=pokerEngineAdapter.decisionView(started);
    expect(view.players.map(p => p.seat)).toEqual([0,5]);
    expect(view.smallBlindSeat).toBe(view.buttonSeat);
  });
  it("handles a short all-in raise without inventing a reopened raise", () => {
    const waiting=pokerEngineAdapter.createGame({ smallBlind:1,bigBlind:2,seatCount:3,
      players:[{ id:"p0",seat:0,name:"Duplicate",controller:"bot",stack:200 },{ id:"p1",seat:1,name:"Duplicate",controller:"bot",stack:7 },{ id:"p2",seat:2,name:"Duplicate",controller:"bot",stack:200 }] });
    const initial=pokerEngineAdapter.startHand(waiting,createDeterministicDeck());
    const run=play(initial,[{ type:"raise",amount:6 },{ type:"raise",amount:7 },{ type:"call",amount:5 }]);
    const ctx=context(run.state,run.history);
    expect(ctx.situation?.preflop).toBe("re-raised");
    expect(ctx.legalActions.some(a => a.type === "raise")).toBe(false);
    expect(ctx.hero.amountToCall).toBe(1);
  });
});
