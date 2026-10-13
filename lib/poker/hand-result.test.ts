import { describe, expect, it } from "vitest";
import type { TableState } from "@hivetech/poker-engine";
import { createDeterministicDeck, pokerEngineAdapter as adapter } from "./adapter";
import { publicProjectionForViewer, reconcilePublicSeats } from "./game-projection";
import { restorePersistedState } from "./persisted-state";
import type { PokerAction, PokerGameState } from "./types";

function start(stacks = [1000, 1000], hole = [["Ah", "Ad"], ["Kh", "Kd"]], board = ["2c", "4s", "7h", "9d", "Ts"]) {
  const order = [...stacks.keys()].slice(1).concat(0);
  const used = [...hole.flat(), ...board];
  const burns = createDeterministicDeck().map(c => `${c.rank}${c.suit}`).filter(c => !used.includes(c)).slice(0, 3);
  return adapter.startHand(adapter.createGame({ smallBlind: 1, bigBlind: 2, startingStack: 9999,
    players: stacks.map((stack, seat) => ({ id: `p${seat}`, seat, name: `P${seat}`, controller: "human", playerToken: `owner${seat}`, stack })),
  }), createDeterministicDeck([...order.map(i => hole[i][0]), ...order.map(i => hole[i][1]),
    burns[0], ...board.slice(0, 3), burns[1], board[3], burns[2], board[4]]));
}
function act(state: PokerGameState, action: PokerAction) {
  const next = adapter.applyAction(state, adapter.snapshot(state).currentActorId!, action);
  expect(next.handStartStacks).toEqual(state.handStartStacks);
  const restored = restorePersistedState(JSON.parse(JSON.stringify(next)));
  expect(restored.handStartStacks).toEqual(state.handStartStacks);
  return restored;
}
function finish(state: PokerGameState) {
  for (let count = 0; count < 30; count++) {
    if (adapter.snapshot(state).street === "complete") return state;
    const legal = adapter.getLegalActions(state);
    state = act(state, legal.find(a => a.type === "check") ?? { type: "call" });
  }
  throw new Error("Hand did not finish");
}
function result(state: PokerGameState, seat = 0) {
  return publicProjectionForViewer(state, `owner${seat}`).viewerHandResult;
}

describe("current-hand personal net result", () => {
  it("uses actual pre-blind stacks and includes blinds for wins and losses", () => {
    const state = start([700, 900]);
    expect(state.handStartStacks).toEqual({ handNumber: 1, stacks: { p0: 700, p1: 900 } });
    expect(result(state)).toBeNull();
    const complete = finish(state);
    expect(result(complete)).toEqual({ startStack: 700, endStack: 702, netChange: 2 });
    expect(result(complete, 1)).toEqual({ startStack: 900, endStack: 898, netChange: -2 });
  });
  it("includes a folded player's posted blind, but excludes refunded uncalled bets from profit", () => {
    const folded = act(start(), { type: "fold" });
    expect(result(folded)).toEqual({ startStack: 1000, endStack: 999, netChange: -1 });
    expect(result(folded, 1)).toEqual({ startStack: 1000, endStack: 1001, netChange: 1 });
    const raised = act(start([1000, 600]), { type: "raise", amount: 1000 });
    expect(result(raised)).toBeNull(); // Unresolved all-in.
    const complete = act(raised, { type: "call" });
    expect(adapter.snapshot(complete).winnerAmounts.p0).toBe(1200);
    expect(result(complete)).toEqual({ startStack: 1000, endStack: 1600, netChange: 600 });
    expect(result(complete, 1)).toEqual({ startStack: 600, endStack: 0, netChange: -600 });
  });
  it("settles side pots separately by player identity", () => {
    let state = start([100, 500, 500], [["Ah", "Ad"], ["Kh", "Kd"], ["Qh", "Qd"]]);
    state = act(state, { type: "raise", amount: 100 });
    state = act(state, { type: "raise", amount: 500 });
    state = act(state, { type: "call" });
    expect(adapter.snapshot(state).winnerAmounts).toEqual({ p0: 300, p1: 800 });
    expect(result(state)).toEqual({ startStack: 100, endStack: 300, netChange: 200 });
    expect(result(state, 1)).toEqual({ startStack: 500, endStack: 800, netChange: 300 });
    expect(result(state, 2)).toEqual({ startStack: 500, endStack: 0, netChange: -500 });
    const table = state.engineState as TableState;
    // Configured seat coordinates are not a source of settled stack identity.
    const relocated = { ...state, config: { ...state.config, players: state.config.players.map(p => ({ ...p, seat: (p.seat + 1) % 3 })) } };
    expect(result(relocated)).toEqual(result(state));
    expect(table.hand?.stage).toBe("complete");
  });
  it("accounts for odd split chips and break-even results", () => {
    let state = start([100, 100, 100], [["2h", "3h"], ["4h", "5h"], ["6h", "7h"]], ["Ts", "Js", "Qs", "Ks", "As"]);
    state = act(state, { type: "call" });
    state = act(state, { type: "fold" });
    state = finish(state);
    expect(adapter.snapshot(state).winnerAmounts).toEqual({ p0: 2, p2: 3 });
    expect(result(state)).toEqual({ startStack: 100, endStack: 100, netChange: 0 });
    expect(result(state, 1)).toEqual({ startStack: 100, endStack: 99, netChange: -1 });
    expect(result(state, 2)).toEqual({ startStack: 100, endStack: 101, netChange: 1 });
  });
  it("replaces the baseline for consecutive hands without using configured buy-ins", () => {
    const complete = act(start([700, 900]), { type: "fold" });
    const second = adapter.startHand(complete, createDeterministicDeck());
    expect(second.handStartStacks).toEqual({ handNumber: 2, stacks: { p0: 699, p1: 901 } });
    expect(result(second)).toBeNull();
    expect(result(act(second, { type: "fold" }), 1)).toEqual({ startStack: 901, endStack: 900, netChange: -1 });
  });
  it.each([undefined, null, {}, { handNumber: 2, stacks: { p0: 1000 } },
    { handNumber: 1, stacks: {} }, { handNumber: 1, stacks: { p0: -1 } },
    { handNumber: 1, stacks: { p0: 0.5 } }, { handNumber: 1, stacks: { p0: "1000" } },
    { handNumber: 1, stacks: { p0: Number.MAX_SAFE_INTEGER + 1 } },
    { handNumber: 1, stacks: { p0: 1000, p1: -1 } },
  ])("safely suppresses legacy/invalid optional baseline %j", baseline => {
    const state = { ...act(start(), { type: "fold" }), handStartStacks: baseline };
    const restored = restorePersistedState(JSON.parse(JSON.stringify(state)));
    expect(result(restored)).toBeNull();
    expect(adapter.snapshot(restored).street).toBe("complete");
  });
  it("isolates owners and retains released participants while excluding spectators, bots and nonparticipants", () => {
    const complete = act(start(), { type: "fold" });
    const released = reconcilePublicSeats("game", complete, complete.config.players.map(p => ({
      gameId: "game", seat: p.seat, enginePlayerId: "replacement", controller: "human", status: "claimed",
      playerToken: "new-owner", isHost: false,
    })));
    expect(result(released)).toEqual(result(complete));
    for (const token of [null, "spectator", "new-owner"]) expect(publicProjectionForViewer(released, token).viewerHandResult).toBeNull();
    const bot = { ...complete, config: { ...complete.config, players: complete.config.players.map(p => ({ ...p, controller: "bot" as const })) } };
    expect(result(bot)).toBeNull();
    const observer = { ...complete, config: { ...complete.config, players: [...complete.config.players,
      { id: "observer", seat: 2, name: "Observer", controller: "human" as const, stack: 1000, playerToken: "observer" }] } };
    expect(publicProjectionForViewer(observer, "observer").viewerHandResult).toBeNull();
    const active = publicProjectionForViewer(start(), "owner0");
    expect(active.players[1].holeCards).toBeNull();
    expect(active.players[1].playerToken).toBeNull();
    expect(JSON.stringify(active)).not.toMatch(/handStartStacks|engineState|owner1/);
    expect(JSON.stringify(publicProjectionForViewer(released, null))).not.toMatch(/handStartStacks|owner0|owner1/);
  });
});
