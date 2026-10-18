import { describe, expect, it } from "vitest";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "./adapter";
import type { PokerAction, PokerGameState } from "./types";
import { getHandReplay } from "./hand-replay";
import { replayResponseSchema } from "@/lib/http/replay-contracts";
const gameId = "11111111-1111-4111-8111-111111111111";
function initial(seats = 2, stacks: number[] = [], deck: string[] = []) {
  return engine.startHand(engine.createGame({ smallBlind: 5, bigBlind: 10, seatCount: seats,
    players: Array.from({ length: seats }, (_, seat) => ({ id: `p${seat}`, seat, name: "Same name", controller: "human" as const,
      stack: stacks[seat] ?? 1000, playerToken: `private-token-${seat}` })) }), createDeterministicDeck(deck));
}
function history(start: PokerGameState, choose: (state: PokerGameState) => PokerAction = passive) {
  let state = start;
  const actions = [];
  while (engine.snapshot(state).street !== "complete") {
    if (actions.length > 100) throw new Error("Fixture loop");
    const view = engine.decisionView(state);
    const action = choose(state);
    actions.push({ sequence: actions.length + 1, street: view.street, action: action.type,
      amount: "amount" in action ? action.amount ?? null : null, actorSeat: view.currentActorSeat,
      stateBefore: state });
    state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
  }
  return { gameId, handNumber: 1, status: "complete", initialState: start, finalState: state, actions, revealedIds: [] as string[] };
}
function passive(state: PokerGameState): PokerAction {
  const legal = engine.getLegalActions(state);
  const action = legal.find(a => a.type === "check" || a.type === "call");
  if (action?.type === "check" || action?.type === "call") return action;
  throw new Error("No passive action");
}
const replay = (row: unknown, token: string | null = null, id = gameId, hand = 1) => getHandReplay(async () => row, id, hand, token);
function allIn(state: PokerGameState): PokerAction {
  const raise = engine.getLegalActions(state).find(a => a.type === "raise" || a.type === "bet");
  return raise?.type === "raise" || raise?.type === "bet" ? { type: raise.type, amount: raise.maxAmount } : passive(state);
}

describe("completed hand replay", () => {
  it.each([2, 3, 4, 5, 6])("replays %i participants with checks/calls and every street", async seats => {
    const row = history(initial(seats));
    const result = await replay(row, "private-token-0");
    expect(result.participants).toHaveLength(seats);
    expect(result.frames[0]).toMatchObject({ kind: "start", street: "preflop", pot: 15 });
    expect(result.frames.filter(f => f.kind === "street").map(f => f.street)).toEqual(["flop", "turn", "river"]);
    expect(result.frames.at(-1)?.kind).toBe("result");
    expect(result.pots).toEqual(engine.replayPots(row.finalState));
    for (const frame of result.frames.slice(0, -1)) {
      expect(frame.players[0].cards).toHaveLength(2);
      expect(frame.players.slice(1).every(p => p.cards === null)).toBe(true);
    }
    expect(result.frames.at(-1)?.players.every(p => p.cards?.length === 2)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/engineState|initialState|finalState|stateBefore|playerToken|private-token|deck|burnCards|provider|modelId|botProfile|legalActions/);
    expect(replayResponseSchema.safeParse({ replay: { ...result, engineState: {} } }).success).toBe(false);
  });
  it("keeps folded/mucked opponents hidden and honors only final authorized reveals", async () => {
    const row = history(initial(), () => ({ type: "fold" }));
    const spectator = await replay(row);
    expect(spectator.frames.every(f => f.players.every(p => p.cards === null))).toBe(true);
    const owner = await replay(row, "private-token-0");
    expect(owner.frames.every(f => f.players[0].cards?.length === 2 && f.players[1].cards === null)).toBe(true);
    const revealed = await replay({ ...row, revealedIds: ["p1"] });
    expect(revealed.frames.slice(0, -1).every(f => f.players.every(p => p.cards === null))).toBe(true);
    expect(revealed.frames.at(-1)?.players[1].cards).toHaveLength(2);
    expect(revealed.frames.at(-1)?.players[0].cards).toBeNull();
  });
  it("uses immutable ownership despite reused seats, names and departed assignments", async () => {
    const row = history(initial(), () => ({ type: "fold" }));
    row.finalState = { ...row.finalState, config: { ...row.finalState.config,
      players: row.finalState.config.players.map(p => ({ ...p, playerToken: "new-owner", name: "Replacement", leaving: true })) } };
    expect((await replay(row, "new-owner")).frames.every(f => f.players.every(p => p.cards === null))).toBe(true);
    const old = await replay(row, "private-token-0");
    expect(old.participants.every(p => p.name === "Same name")).toBe(true);
    expect(old.frames.at(-1)?.players[0].cards).toHaveLength(2);
  });
  it.each([2, 3, 4, 5, 6])("represents %i-seat all-in runouts before the authoritative settlement", async seats => {
    const row = history(initial(seats), allIn);
    const result = await replay(row);
    expect(result.frames.filter(f => f.kind === "street").map(f => [f.street, f.board.length])).toEqual([["flop", 3], ["turn", 4], ["river", 5]]);
    expect(result.frames.filter(f => f.kind === "street").every(f => f.players.every(p => p.stack === 0 && p.bet === 0 && p.allIn))).toBe(true);
    expect(result.pots.flatMap(p => p.awards).reduce((n, a) => n + a.amount, 0)).toBe(seats * 1000);
  });
  it("preserves split awards independently from stack changes", async () => {
    // Heads-up: round-robin holdings, burns, then a royal flush on the board.
    const row = history(initial(2, [], ["2c", "3c", "4d", "5d", "6c", "Ts", "Js", "Qs", "7c", "Ks", "8c", "As"]), allIn);
    const result = await replay(row);
    expect(result.pots).toEqual([{ amount: 2000, awards: expect.arrayContaining([{ seat: 0, amount: 1000 }, { seat: 1, amount: 1000 }]) }]);
  });
  it("preserves side pots and folds, including a departure marked in pre-action config", async () => {
    const start = initial(4, [100, 500, 500, 500]);
    const row = history(start, state => engine.snapshot(state).currentActorId === "p3" ? { type: "fold" } : allIn(state));
    const fold = row.actions.find(a => a.action === "fold")!;
    fold.stateBefore = { ...fold.stateBefore, config: { ...fold.stateBefore.config,
      players: fold.stateBefore.config.players.map(p => ({ ...p, leaving: p.id === "p3" })) } };
    const result = await replay(row);
    expect(result.pots.length).toBeGreaterThan(1);
    expect(result.pots).toEqual(engine.replayPots(row.finalState));
    expect(result.frames.at(-1)?.players[3].cards).toBeNull();
  });
  it.each([
    ["initial missing", (row: ReturnType<typeof history>) => ({ ...row, initialState: {} })],
    ["final missing", (row: ReturnType<typeof history>) => ({ ...row, finalState: null })],
    ["pre-action missing", (row: ReturnType<typeof history>) => ({ ...row, actions: [{ ...row.actions[0], stateBefore: {} }] })],
    ["sequence gap", (row: ReturnType<typeof history>) => ({ ...row, actions: [{ ...row.actions[0], sequence: 2 }] })],
    ["actor mismatch", (row: ReturnType<typeof history>) => ({ ...row, actions: [{ ...row.actions[0], actorSeat: 5 }] })],
    ["street mismatch", (row: ReturnType<typeof history>) => ({ ...row, actions: [{ ...row.actions[0], street: "river" }] })],
    ["illegal check", (row: ReturnType<typeof history>) => ({ ...row, actions: [{ ...row.actions[0], action: "check" }] })],
    ["legacy all-in", (row: ReturnType<typeof history>) => ({ ...row, actions: [{ ...row.actions[0], action: "all_in" }] })],
    ["final mismatch", (row: ReturnType<typeof history>) => ({ ...row, finalState: history(initial(), allIn).finalState })],
    ["missing action", (row: ReturnType<typeof history>) => ({ ...row, actions: [] })],
  ])("fails closed for %s", async (_, mutate) => {
    await expect(replay(mutate(history(initial(), () => ({ type: "fold" }))))).rejects.toMatchObject({ code: "REPLAY_UNAVAILABLE" });
  });
  it("rejects a truncated history even if its later preflop snapshot replays to the final state", async () => {
    const row = history(initial());
    await expect(replay({ ...row, initialState: row.actions[1].stateBefore,
      actions: row.actions.slice(1).map((a, i) => ({ ...a, sequence: i + 1 })) })).rejects.toMatchObject({ code: "REPLAY_UNAVAILABLE" });
  });
  it("preserves postflop bets and the distinct next actor", async () => {
    const row = history(initial(), state => {
      const bet = engine.getLegalActions(state).find(a => a.type === "bet");
      return bet?.type === "bet" ? { type: "bet", amount: bet.minAmount } : passive(state);
    });
    const result = await replay(row);
    const betFrame = result.frames.find(f => f.action?.type === "bet");
    expect(betFrame?.nextActorSeat).not.toBe(betFrame?.action?.actorSeat);
    expect(betFrame?.players.find(p => p.seat === betFrame.action?.actorSeat)?.bet).toBe(betFrame?.action?.amount);
  });
  it("distinguishes missing, unfinished, corrupt, cross-hand/game and DB failures", async () => {
    await expect(replay(null)).rejects.toMatchObject({ code: "REPLAY_MISSING" });
    const row = history(initial());
    await expect(replay({ ...row, status: "playing" })).rejects.toMatchObject({ code: "REPLAY_UNFINISHED" });
    await expect(replay(row, null, "22222222-2222-4222-8222-222222222222")).rejects.toMatchObject({ code: "REPLAY_UNAVAILABLE" });
    await expect(replay(row, null, gameId, 2)).rejects.toMatchObject({ code: "REPLAY_UNAVAILABLE" });
    const failure = new Error("database");
    await expect(getHandReplay(async () => { throw failure; }, gameId, 1, null)).rejects.toBe(failure);
  });
});

describe("fixed shared replay visibility", () => {
  it("shows folded sharer, folded bot, showdown and explicit Show humans from every frame, never an unrevealed folded human", async () => {
    const { projectSharedReplay } = await import("./replay-sharing");
    const { reconstructHandReplay } = await import("./hand-replay");
    const base = initial(6);
    const start: PokerGameState = { ...base, config: { ...base.config, players: base.config.players.map(p => p.seat === 4 ? { ...p, controller: "bot" } : p) } };
    const row = history(start, state => ["p0", "p3", "p4", "p5"].includes(engine.snapshot(state).currentActorId!) ? { type: "fold" } : passive(state));
    row.revealedIds = ["p0"];
    const source = reconstructHandReplay(row, gameId, 1);
    const snapshot = projectSharedReplay(source, "private-token-3");
    for (const frame of snapshot.replay.frames) {
      for (const p of frame.players) expect(p.cards?.length ?? null).toBe(p.seat === 5 ? null : 2);
    }
    expect(Object.keys(snapshot.replay).sort()).toEqual(["bigBlindSeat", "dealerSeat", "frames", "participants", "pots", "smallBlindSeat"]);
    expect(JSON.stringify(snapshot)).not.toMatch(/gameId|handNumber|playerToken|engineState|p0|private-token|deck|provider|modelId/);
    expect(snapshot.replay.participants.every(p => p.name === "Same name")).toBe(true);
    const before = JSON.stringify(snapshot);
    row.revealedIds.push("p5");
    expect(JSON.stringify(snapshot)).toBe(before);
    const updated = projectSharedReplay(reconstructHandReplay(row, gameId, 1), "private-token-3");
    expect(updated.replay.frames.every(f => f.players.every(p => p.cards?.length === 2))).toBe(true);
  });
  it("authorizes only immutable participating human ownership, after departures and seat reuse", async () => {
    const { projectSharedReplay } = await import("./replay-sharing");
    const { reconstructHandReplay } = await import("./hand-replay");
    const row = history(initial(), () => ({ type: "fold" }));
    row.finalState = { ...row.finalState, config: { ...row.finalState.config, players: row.finalState.config.players.map(p => ({ ...p, playerToken: "replacement", leaving: true })) } };
    const source = reconstructHandReplay(row, gameId, 1);
    expect(() => projectSharedReplay(source, "replacement")).toThrow("SHARE_FORBIDDEN");
    expect(() => projectSharedReplay(source, "unseated-host")).toThrow("SHARE_FORBIDDEN");
    expect(() => projectSharedReplay(source, "spectator")).toThrow("SHARE_FORBIDDEN");
    expect(projectSharedReplay(source, "private-token-0").replay.frames.every(f => f.players[0].cards?.length === 2)).toBe(true);
    source.holdings[0].controller = "bot";
    expect(() => projectSharedReplay(source, "private-token-0")).toThrow("SHARE_FORBIDDEN");
  });
});
