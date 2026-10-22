import type { TableState } from "@hivetech/poker-engine";
import { describe, expect, it, vi } from "vitest";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "./adapter";
import { getPersonalResults, ResultsMissing } from "./personal-results";
import { resultsResponseSchema } from "@/lib/http/results-contracts";
import type { PokerAction, PokerGameState } from "./types";

function start(stacks = [10000, 10000], bigBlind = 10, token = "owner", hole = [["Ah", "Ad"], ["Kh", "Kd"]], board = ["2c", "4s", "7h", "9d", "Ts"]) {
  const order = [...stacks.keys()].slice(1).concat(0);
  const used = [...hole.flat(), ...board];
  const burns = createDeterministicDeck().map(c => `${c.rank}${c.suit}`).filter(c => !used.includes(c)).slice(0, 3);
  return engine.startHand(engine.createGame({ smallBlind: Math.floor(bigBlind / 2), bigBlind, players: stacks.map((stack, seat) => ({
    id: `p${seat}`, seat, name: "Same name", controller: "human", playerToken: seat === 0 ? token : `other-${seat}`, stack,
  })) }), createDeterministicDeck([...order.map(i => hole[i][0]), ...order.map(i => hole[i][1]), burns[0], ...board.slice(0, 3), burns[1], board[3], burns[2], board[4]]));
}
function act(state: PokerGameState, action: PokerAction) { return engine.applyAction(state, engine.snapshot(state).currentActorId!, action); }
function finish(state: PokerGameState, allIn = false): PokerGameState {
  for (let i = 0; i < 100; i++) {
    if (engine.snapshot(state).street === "complete") return state;
    const legal = engine.getLegalActions(state);
    const raise = allIn ? legal.find(a => a.type === "raise" || a.type === "bet") : undefined;
    state = act(state, raise && "maxAmount" in raise ? { type: raise.type, amount: raise.maxAmount } : legal.find(a => a.type === "check") ?? { type: "call" });
  }
  throw new Error("Fixture did not finish");
}
const row = (initialState: PokerGameState, finalState = act(initialState, { type: "fold" })) => ({ handNumber: engine.snapshot(initialState).handNumber, initialState, finalState });
async function results(hands: unknown[], token: string | null = "owner", throughHand = hands.length) {
  return getPersonalResults(async () => ({ throughHand, hands }), token);
}

describe("private table results", () => {
  it("includes blinds in profit and excludes refunds, using pre-blind and settled stacks", async () => {
    expect(await results([row(start())])).toMatchObject({ handsPlayed: 1, netChips: -5, netBB: -0.5, biggestWin: null, biggestLoss: { handNumber: 1, netChips: -5 } });
    const initial = start([1000, 600]);
    const final = act(act(initial, { type: "raise", amount: 1000 }), { type: "call" });
    expect(engine.snapshot(final).winnerAmounts.p0).toBe(1200);
    expect(await results([row(initial, final)])).toMatchObject({ netChips: 600, netBB: 60 });
    expect(await results([row(initial, final)], "other-1")).toMatchObject({ netChips: -600, handsPlayed: 1 });
  });
  it("settles side pots, folds, departures and elimination by immutable identity", async () => {
    const initial = start([100, 500, 500], 2, "owner", [["Ah", "Ad"], ["Kh", "Kd"], ["Qh", "Qd"]]);
    const final = act(act(act(initial, { type: "raise", amount: 100 }), { type: "raise", amount: 500 }), { type: "call" });
    const departed = { ...final, config: { ...final.config, players: final.config.players.map(p => ({ ...p, playerToken: "replacement", leaving: true })) } };
    expect(await results([row(initial, departed)])).toMatchObject({ netChips: 200 });
    expect(await results([row(initial, departed)], "other-1")).toMatchObject({ netChips: 300 });
    expect(await results([row(initial, departed)], "other-2")).toMatchObject({ netChips: -500 });
    expect(await results([row(initial, departed)], "replacement")).toMatchObject({ handsPlayed: 0, netChips: 0 });
  });
  it("counts split break-even hands without inventing winning/losing highlights", async () => {
    const initial = start([100, 100], 2, "owner", [["2h", "3h"], ["4h", "5h"]], ["Ts", "Js", "Qs", "Ks", "As"]);
    const result = await results([row(initial, finish(initial, true))]);
    expect(result).toMatchObject({ handsPlayed: 1, netChips: 0, netBB: 0, biggestWin: null, biggestLoss: null });
  });
  it.each([51, 100, 101, 205])("aggregates %i hands in keyset pages with an unchanged upper boundary", async count => {
    const hands: ReturnType<typeof row>[] = [];
    let initial = start();
    for (let i = 0; i < count; i++) {
      const hand = row(initial);
      hands.push(hand);
      initial = engine.startHand(hand.finalState, createDeterministicDeck());
    }
    const read = vi.fn(async (after: number, through: number | null) => ({ throughHand: through ?? count,
      hands: hands.filter(h => h.handNumber > after && h.handNumber <= (through ?? count)).slice(0, 100) }));
    const result = await getPersonalResults(read, "owner");
    expect(result.handsPlayed).toBe(count);
    expect(result.excludedHands).toBe(0);
    expect(read.mock.calls[0]).toEqual([0, null]);
    if (count >= 100) expect(read.mock.calls[1]).toEqual([100, count]);
    expect(result.netChips).toBe(hands.reduce((n, h) => n + (engine.decisionView(h.finalState).players.find(p => p.id === "p0")!.stack - h.initialState.handStartStacks!.stacks.p0), 0));
    expect(result.biggestLoss?.handNumber).toBe(1);
    if (count > 1) expect(result.biggestWin?.handNumber).toBe(2);
  });
  it("sums original historical BB fractions and keeps chip-selected highlights and earliest ties", async () => {
    const first = row(start([10000, 10000], 3));
    const fresh = start([10000, 10000], 20);
    const table = fresh.engineState as TableState;
    const secondStart = { ...fresh, engineState: { ...table, handNumber: 2, hand: { ...table.hand!, handNumber: 2 } },
      handStartStacks: { ...fresh.handStartStacks!, handNumber: 2 } };
    const second = row(secondStart, act(act(secondStart, { type: "raise", amount: 40 }), { type: "fold" }));
    const result = await results([first, second]);
    expect(result.netChips).toBe(19);
    expect(result.netBB).toBeCloseTo(2 / 3, 14);
    expect(result.biggestWin).toEqual({ handNumber: 2, netChips: 20, netBB: 1 });
  });
  it("follows seat changes and initial ownership while ignoring names and host privileges", async () => {
    const first = row(start());
    const moved = engine.startHand({ ...first.finalState, config: { ...first.finalState.config,
      players: first.finalState.config.players.map(p => ({ ...p, playerToken: p.id === "p1" ? "owner" : "replacement" })) } }, createDeterministicDeck());
    expect(await results([first, row(moved)])).toMatchObject({ handsPlayed: 2, netChips: -10 });
    expect(await results([first], "host-only")).toMatchObject({ handsPlayed: 0, netChips: 0 });
    expect(await results([first], null)).toMatchObject({ handsPlayed: 0, netChips: 0 });
  });
  it("marks missing metadata and inconsistent/unsettled finals as unavailable rather than zero", async () => {
    const initial = start();
    const hand = row(initial);
    for (const bad of [
      { ...hand, initialState: { ...initial, handStartStacks: undefined } },
      { ...hand, initialState: { ...initial, config: { ...initial.config, bigBlind: undefined } } },
      { ...hand, initialState: { ...initial, config: { ...initial.config, players: initial.config.players.map(p => ({ ...p, stack: undefined })) } } },
      { ...hand, finalState: null }, { ...hand, finalState: initial },
      { ...hand, initialState: { ...initial, handStartStacks: { handNumber: 1, stacks: { p0: 0, p1: 0 } } } },
    ]) expect(await results([bad])).toMatchObject({ handsPlayed: 1, availableHands: 0, excludedHands: 1, incomplete: true, ownershipIncomplete: false, netChips: null, netBB: null });
    for (const initialState of [{}, { ...initial, config: { ...initial.config, players: initial.config.players.map(p => ({ ...p, playerToken: undefined })) } }]) {
      expect(await results([{ ...hand, initialState }])).toMatchObject({ excludedHands: 1, ownershipIncomplete: true });
    }
    expect(await results([hand], "owner", 3)).toMatchObject({ handsPlayed: 1, excludedHands: 2, ownershipIncomplete: true });
  });
  it("ignores sitting-out owners and rejects ambiguous duplicate ownership", async () => {
    const hand = row(start());
    const watching = { ...hand.initialState, config: { ...hand.initialState.config, players: [
      ...hand.initialState.config.players.map(p => ({ ...p, playerToken: `different-${p.id}` })),
      { id: "watcher", seat: 2, name: "Same name", controller: "human" as const, stack: 0, playerToken: "owner" },
    ] } };
    expect(await results([{ ...hand, initialState: watching }])).toMatchObject({ handsPlayed: 0, incomplete: false });
    const ambiguous = { ...hand.initialState, config: { ...hand.initialState.config, players: hand.initialState.config.players.map(p => ({ ...p, playerToken: "owner" })) } };
    expect(await results([{ ...hand, initialState: ambiguous }])).toMatchObject({ handsPlayed: 0, ownershipIncomplete: true });
  });
  it("fails intermediate reads and rejects malformed page envelopes, reordering and boundary shifts", async () => {
    const read = vi.fn().mockResolvedValueOnce({ throughHand: 101, hands: Array.from({ length: 100 }, (_, i) => ({ handNumber: i + 1, initialState: {}, finalState: {} })) })
      .mockRejectedValueOnce(new Error("database failed"));
    await expect(getPersonalResults(read, "owner")).rejects.toThrow("database failed");
    read.mockReset().mockResolvedValueOnce({ throughHand: 101, hands: Array.from({ length: 100 }, (_, i) => ({ handNumber: i + 1, initialState: {}, finalState: {} })) })
      .mockResolvedValueOnce({ throughHand: 102, hands: [] });
    await expect(getPersonalResults(read, "owner")).rejects.toThrow("boundary");
    await expect(getPersonalResults(async () => null, "owner")).rejects.toBeInstanceOf(ResultsMissing);
    await expect(results([row(start()), row(start())])).rejects.toThrow("order");
  });
  it("returns only strict summary data without holdings, states, identities or other players", async () => {
    const result = await results([row(start())]);
    expect(JSON.stringify(result)).not.toMatch(/"owner"|other-|name|cards|state|token|players|provider/i);
    expect(resultsResponseSchema.safeParse({ results: { ...result, privateState: {} } }).success).toBe(false);
  });
});
