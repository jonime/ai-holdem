import { describe, expect, it } from "vitest";
import { createDeterministicDeck, pokerEngineAdapter as adapter } from "@/lib/poker/adapter";
import { publicPlayerSchema } from "@/lib/http/schemas";
import { clampTarget, decisionScope, potPresetTarget, validatedTarget } from "./bet-sizing";
import type { PokerGameState } from "@/lib/poker/types";

const config = {
  smallBlind: 50, bigBlind: 100,
  players: [
    { id: "a", name: "A", controller: "human" as const, seat: 0, stack: 10_000 },
    { id: "b", name: "B", controller: "human" as const, seat: 1, stack: 10_000 },
  ],
};
function start() {
  return adapter.startHand(adapter.createGame(config), createDeterministicDeck());
}
function preset(state: PokerGameState, fraction: number) {
  const id = adapter.snapshot(state).currentActorId!;
  const view = adapter.publicProjection(state, id);
  const player = view.players.find(p => p.id === id)!;
  const action = view.legalActions.find(a => a.type === "bet" || a.type === "raise")!;
  if (action.type !== "bet" && action.type !== "raise") throw new Error("Expected sizing");
  const call = view.legalActions.find(a => a.type === "call");
  const target = potPresetTarget(action, view.pot, player.committedStreet, call?.type === "call" ? call.amount : 0, fraction);
  const next = adapter.applyAction(state, id, { type: action.type, amount: target });
  const after = adapter.publicProjection(next, id).players.find(p => p.id === id)!;
  expect(player.stack - after.stack).toBe(target - player.committedStreet);
  return { target, next, added: player.stack - after.stack };
}

describe("bet sizing", () => {
  it("raises to 300 adding 250 from opening heads-up 50/100 blinds", () => {
    expect(preset(start(), 1)).toMatchObject({ target: 300, added: 250 });
  });
  it("includes existing commitments and the pot after calling on repeated raises", () => {
    const first = preset(start(), 1);
    const second = preset(first.next, 1);
    expect(second).toMatchObject({ target: 900, added: 800 });
    expect(preset(second.next, 0.5)).toMatchObject({ target: 1800, added: 1500 });
  });
  it("sizes the big-blind option with no call cost and flop bets", () => {
    let state = adapter.applyAction(start(), "a", { type: "call", amount: 50 });
    expect(preset(state, 1)).toMatchObject({ target: 300, added: 200 });
    state = adapter.applyAction(state, "b", { type: "check" });
    expect(preset(state, 0.75)).toMatchObject({ target: 150, added: 150 });
  });
  it("rounds and clamps to legal minimum and all-in maximum", () => {
    const bet = { type: "bet" as const, minAmount: 100, maxAmount: 500 };
    expect(potPresetTarget(bet, 201, 0, 0, 0.75)).toBe(151);
    expect(potPresetTarget(bet, 10, 0, 0, 0.5)).toBe(100);
    expect(potPresetTarget(bet, 2000, 0, 0, 1)).toBe(500);
    const short = adapter.startHand(adapter.createGame({ ...config, players: config.players.map(p => ({ ...p, stack: 250 })) }), createDeterministicDeck());
    expect(preset(short, 1)).toMatchObject({ target: 250, added: 200 });
    expect(clampTarget(900, bet)).toBe(500);
  });
  it.each(["", " ", "100.5", "-1", "501", "9007199254740992"])("rejects invalid draft %j", draft => {
    expect(validatedTarget(draft, { type: "raise", minAmount: 100, maxAmount: 500 })).toBeNull();
  });
  it("validates exact endpoints and scopes decisions by identity and version", () => {
    const action = { type: "raise" as const, minAmount: 100, maxAmount: 500 };
    expect(validatedTarget("100", action)).toBe(100);
    expect(validatedTarget("500", action)).toBe(500);
    expect(decisionScope("a", 1, "p")).toBe(decisionScope("a", 1, "p"));
    for (const other of [decisionScope("a", 2, "p"), decisionScope("b", 1, "p"), decisionScope("a", 1, "q")]) {
      expect(other).not.toBe(decisionScope("a", 1, "p"));
    }
  });
  it("projects commitments publicly while preserving spectator card/token masking", () => {
    const state = start();
    const view = adapter.publicProjection(state, null);
    expect(view.players.map(p => p.committedStreet)).toEqual([50, 100]);
    for (const player of view.players) {
      expect(player.holeCards).toBeNull();
      expect(player.playerToken).toBeNull();
      expect(publicPlayerSchema.safeParse(player).success).toBe(true);
      for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
        expect(publicPlayerSchema.safeParse({ ...player, committedStreet: invalid }).success).toBe(false);
      }
    }
    expect(adapter.publicProjection(adapter.createGame(config), null).players.map(p => p.committedStreet)).toEqual([0, 0]);
  });
});
