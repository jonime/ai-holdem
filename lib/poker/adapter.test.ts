import { describe, expect, it } from "vitest";

import { createDeterministicDeck, pokerEngineAdapter } from "./adapter";
import type { GameConfig, PokerAction, PokerGameState } from "./types";

const headsUpConfig: GameConfig = {
  smallBlind: 50,
  bigBlind: 100,
  players: [
    { id: "human", name: "You", controller: "human", seat: 0, stack: 10_000 },
    {
      id: "ai",
      name: "TypeSafe AI",
      controller: "typesafe_ai",
      seat: 1,
      stack: 10_000,
    },
  ],
};

function startHand(): PokerGameState {
  return pokerEngineAdapter.startHand(
    pokerEngineAdapter.createGame(headsUpConfig),
    createDeterministicDeck(),
  );
}

function currentActor(state: PokerGameState): string {
  const actorId = pokerEngineAdapter.snapshot(state).currentActorId;
  expect(actorId).not.toBeNull();
  return actorId!;
}

function passiveAction(state: PokerGameState): PokerAction {
  const legalActions = pokerEngineAdapter.getLegalActions(state);
  const check = legalActions.find((action) => action.type === "check");

  if (check) {
    return check;
  }

  const call = legalActions.find((action) => action.type === "call");
  if (call?.type === "call") {
    return { type: "call", amount: call.amount };
  }

  throw new Error("Expected a check or call action");
}

function playToShowdown(initialState: PokerGameState): PokerGameState {
  let state = initialState;

  for (let actionCount = 0; actionCount < 20; actionCount += 1) {
    if (pokerEngineAdapter.snapshot(state).street === "complete") {
      return state;
    }

    state = pokerEngineAdapter.applyAction(
      state,
      currentActor(state),
      passiveAction(state),
    );
  }

  throw new Error("Expected the hand to complete within 20 actions");
}

function playToStreet(
  initialState: PokerGameState,
  target: "flop" | "turn" | "river",
): PokerGameState {
  let state = initialState;
  for (let actionCount = 0; actionCount < 20; actionCount += 1) {
    if (pokerEngineAdapter.snapshot(state).street === target) return state;
    state = pokerEngineAdapter.applyAction(
      state,
      currentActor(state),
      passiveAction(state),
    );
  }
  throw new Error(`Expected to reach ${target}`);
}

describe("pokerEngineAdapter", () => {
  it("projects blind postings in small-then-big order", () => {
    const { blindPostings: recordedPostings, ...legacyState } = startHand();
    expect(recordedPostings).toHaveLength(2);

    expect(pokerEngineAdapter.blindPostings(legacyState)).toEqual([
      { playerId: "human", blind: "small", amount: 50 },
      { playerId: "ai", blind: "big", amount: 100 },
    ]);
  });

  it("reports the amount actually posted by a short-stacked blind", () => {
    const state = pokerEngineAdapter.startHand(
      pokerEngineAdapter.createGame({
        ...headsUpConfig,
        players: [
          { ...headsUpConfig.players[0], stack: 25 },
          headsUpConfig.players[1],
        ],
      }),
      createDeterministicDeck(),
    );

    expect(pokerEngineAdapter.blindPostings(state)).toEqual([
      { playerId: "human", blind: "small", amount: 25 },
      { playerId: "ai", blind: "big", amount: 100 },
    ]);
  });

  it("starts a deterministic heads-up hand and resolves a fold", () => {
    let state = pokerEngineAdapter.startHand(
      pokerEngineAdapter.createGame(headsUpConfig),
      createDeterministicDeck(),
    );

    const snapshot = pokerEngineAdapter.snapshot(state);
    expect(snapshot.currentActorId).toBe("human");
    expect(pokerEngineAdapter.getLegalActions(state)).toEqual(
      expect.arrayContaining([
        { type: "fold" },
        { type: "call", amount: 50 },
        expect.objectContaining({ type: "raise" }),
      ]),
    );

    state = pokerEngineAdapter.applyAction(state, "human", { type: "fold" });

    expect(pokerEngineAdapter.snapshot(state)).toMatchObject({
      street: "complete",
      completionReason: "fold",
      winnerIds: ["ai"],
    });
  });

  it("projects only the viewer's hole cards during a hand", () => {
    const state = startHand();
    const projection = pokerEngineAdapter.publicProjection(state, "human");
    const human = projection.players.find((player) => player.id === "human");
    const ai = projection.players.find((player) => player.id === "ai");

    expect(human?.holeCards).toHaveLength(2);
    expect(ai?.holeCards).toBeNull();
    expect(projection).toMatchObject({
      dealerSeat: 0,
      smallBlindSeat: 0,
      bigBlindSeat: 1,
    });
    expect(projection).not.toHaveProperty("engineState");
  });

  it("describes the player's exact made hand without exposing opponents", () => {
    const deck = createDeterministicDeck([
      "Qs",
      "As",
      "9h",
      "Kd",
      "2c",
      "Qd",
      "9c",
      "4h",
      "3c",
      "3s",
      "5c",
      "Jh",
    ]);
    const river = playToStreet(
      pokerEngineAdapter.startHand(
        pokerEngineAdapter.createGame(headsUpConfig),
        deck,
      ),
      "river",
    );

    expect(pokerEngineAdapter.describePlayerHand(river, "ai")).toEqual({
      madeHand: "two-pair",
      bestFive: expect.arrayContaining(["Qs", "Qd", "9h", "9c", "Jh"]),
      usesHoleCards: true,
      draws: { flushDraw: false, straightCompletionRanks: [] },
    });
  });

  it("reports deterministic flush and straight-completion draws", () => {
    const deck = createDeterministicDeck([
      "As",
      "2h",
      "Ks",
      "3d",
      "4c",
      "Qs",
      "Js",
      "2d",
    ]);
    const flop = playToStreet(
      pokerEngineAdapter.startHand(
        pokerEngineAdapter.createGame(headsUpConfig),
        deck,
      ),
      "flop",
    );

    expect(pokerEngineAdapter.describePlayerHand(flop, "ai")).toMatchObject({
      madeHand: "high-card",
      usesHoleCards: true,
      draws: { flushDraw: true, straightCompletionRanks: ["T"] },
    });
  });

  it("hides all hole cards for an unseated spectator", () => {
    const state = startHand();
    const projection = pokerEngineAdapter.publicProjection(state, null);

    expect(
      projection.players.every((player) => player.holeCards === null),
    ).toBe(true);
    expect(projection.legalActions).toEqual([]);
  });

  it("shows each non-folded player's best hand after a showdown", () => {
    const state = playToShowdown(startHand());
    const projection = pokerEngineAdapter.publicProjection(state, null);

    expect(projection.completionReason).toBe("showdown");
    expect(
      projection.players
        .filter((player) => !player.folded)
        .every((player) => player.bestHand !== null),
    ).toBe(true);
    expect(
      projection.players
        .filter((player) => player.folded)
        .every((player) => player.bestHand === null),
    ).toBe(true);
  });

  it("preserves the viewer's private cards after JSON restoration", () => {
    const state = startHand();
    const restoredState = pokerEngineAdapter.restore(
      JSON.parse(JSON.stringify(state)) as PokerGameState,
    );
    const projection = pokerEngineAdapter.publicProjection(
      restoredState,
      "human",
    );

    expect(
      projection.players.find((player) => player.id === "human")?.holeCards,
    ).toHaveLength(2);
    expect(
      projection.players.find((player) => player.id === "ai")?.holeCards,
    ).toBeNull();
  });

  it("advances through every street and resolves a deterministic showdown", () => {
    let state = startHand();
    const streets = new Set<string>();

    for (let actionCount = 0; actionCount < 20; actionCount += 1) {
      const snapshot = pokerEngineAdapter.snapshot(state);
      if (snapshot.street) {
        streets.add(snapshot.street);
      }
      if (snapshot.street === "complete") {
        break;
      }

      state = pokerEngineAdapter.applyAction(
        state,
        currentActor(state),
        passiveAction(state),
      );
    }

    const completeHand = pokerEngineAdapter.snapshot(state);
    expect(streets).toEqual(
      new Set(["preflop", "flop", "turn", "river", "complete"]),
    );
    expect(completeHand).toMatchObject({
      street: "complete",
      completionReason: "showdown",
    });
    expect(completeHand.communityCards).toHaveLength(5);
    expect(completeHand.winnerIds.length).toBeGreaterThan(0);
    expect(
      Object.values(completeHand.winnerAmounts).reduce(
        (total, amount) => total + amount,
        0,
      ),
    ).toBeGreaterThan(0);
  });

  it("rejects an under-minimum raise before sending it to the engine", () => {
    const state = startHand();
    const raise = pokerEngineAdapter
      .getLegalActions(state)
      .find((action) => action.type === "raise");

    expect(raise?.type).toBe("raise");
    if (raise?.type !== "raise") {
      throw new Error("Expected a preflop raise option");
    }

    expect(() =>
      pokerEngineAdapter.applyAction(state, currentActor(state), {
        type: "raise",
        amount: raise.minAmount - 1,
      }),
    ).toThrow("outside the legal raise range");
  });

  it("applies ordinary raises and postflop bets", () => {
    let state = startHand();
    const preflopRaise = pokerEngineAdapter
      .getLegalActions(state)
      .find((action) => action.type === "raise");

    expect(preflopRaise?.type).toBe("raise");
    if (preflopRaise?.type !== "raise") {
      throw new Error("Expected a preflop raise option");
    }

    state = pokerEngineAdapter.applyAction(state, currentActor(state), {
      type: "raise",
      amount: preflopRaise.minAmount,
    });
    state = pokerEngineAdapter.applyAction(
      state,
      currentActor(state),
      passiveAction(state),
    );

    const flopBet = pokerEngineAdapter
      .getLegalActions(state)
      .find((action) => action.type === "bet");
    expect(flopBet?.type).toBe("bet");
    if (flopBet?.type !== "bet") {
      throw new Error("Expected a flop bet option");
    }

    state = pokerEngineAdapter.applyAction(state, currentActor(state), {
      type: "bet",
      amount: flopBet.minAmount,
    });
    state = pokerEngineAdapter.applyAction(
      state,
      currentActor(state),
      passiveAction(state),
    );

    expect(pokerEngineAdapter.snapshot(state).street).toBe("turn");
  });

  it("handles a legal all-in raise and automatic board runout", () => {
    let state = startHand();
    const raise = pokerEngineAdapter
      .getLegalActions(state)
      .find((action) => action.type === "raise");

    expect(raise?.type).toBe("raise");
    if (raise?.type !== "raise") {
      throw new Error("Expected a preflop raise option");
    }

    state = pokerEngineAdapter.applyAction(state, currentActor(state), {
      type: "raise",
      amount: raise.maxAmount,
    });
    state = pokerEngineAdapter.applyAction(
      state,
      currentActor(state),
      passiveAction(state),
    );

    expect(pokerEngineAdapter.snapshot(state)).toMatchObject({
      street: "complete",
      completionReason: "showdown",
      communityCards: expect.any(Array),
    });
    expect(pokerEngineAdapter.snapshot(state).communityCards).toHaveLength(5);
  });

  it("restores serialized state and starts a new hand with a fresh board", () => {
    const completedFirstHand = playToShowdown(startHand());
    const restoredState = pokerEngineAdapter.restore(
      JSON.parse(JSON.stringify(completedFirstHand)) as PokerGameState,
    );
    const firstBoard =
      pokerEngineAdapter.snapshot(restoredState).communityCards;

    const nextHand = pokerEngineAdapter.startHand(
      restoredState,
      createDeterministicDeck(["As", "Ks", "Qs", "Js", "Ts"]),
    );
    const completedSecondHand = playToShowdown(nextHand);
    const secondSnapshot = pokerEngineAdapter.snapshot(completedSecondHand);

    expect(pokerEngineAdapter.snapshot(nextHand)).toMatchObject({
      handNumber: 2,
      street: "preflop",
      communityCards: [],
    });
    expect(secondSnapshot.communityCards).toHaveLength(5);
    expect(secondSnapshot.communityCards).not.toEqual(firstBoard);
  });
});

describe("public winning five", () => {
  function rigged(hole: string[], other: string[], board: string[]) {
    const used = [...hole, ...other, ...board];
    const burns = createDeterministicDeck().map(c => `${c.rank}${c.suit}`).filter(c => !used.includes(c)).slice(0, 3);
    return pokerEngineAdapter.startHand(pokerEngineAdapter.createGame(headsUpConfig),
      createDeterministicDeck([other[0], hole[0], other[1], hole[1], burns[0],
        ...board.slice(0, 3), burns[1], board[3], burns[2], board[4]]));
  }
  it.each([
    ["full-house", ["Kh", "Kd"], ["2c", "3c"], ["Ks", "7d", "7c", "9h", "Js"], ["Kh", "Kd", "Ks", "7d", "7c"]],
    ["one-pair", ["Ah", "Qc"], ["As", "Tc"], ["Ad", "Kh", "9c", "6s", "2d"], ["Ah", "Ad", "Kh", "Qc", "9c"]],
    ["straight", ["9h", "8d"], ["2c", "3c"], ["7s", "6h", "5c", "Kd", "Qs"], ["9h", "8d", "7s", "6h", "5c"]],
    ["straight", ["Ah", "2d"], ["Kc", "Qc"], ["3s", "4h", "5c", "Kd", "9s"], ["Ah", "2d", "3s", "4h", "5c"]],
    ["flush", ["Ah", "8h"], ["Kc", "Qc"], ["3h", "4h", "5h", "Kd", "9s"], ["Ah", "8h", "3h", "4h", "5h"]],
  ])("selects engine cards for %s", (category, hole, other, board, expected) => {
    const state = playToShowdown(rigged(hole, other, board));
    const game = pokerEngineAdapter.publicProjection(state, null);
    expect(game.winnerIds).toContain("human");
    const winner = game.players.find(p => p.id === "human")!;
    expect(winner.bestHand).toBe(category);
    expect(winner.winningHand?.cards).toEqual(expect.arrayContaining(expected));
    expect(winner.winningHand?.cards).toEqual(pokerEngineAdapter.describePlayerHand(state, "human").bestFive);
    expect(winner.winningHand?.cards).toHaveLength(5);
    expect(winner.winningHand?.playsBoard).toBe(false);
    expect(game.players.find(p => p.id === "ai")?.winningHand).toBeNull();
    expect(pokerEngineAdapter.publicProjection(state, "human")).toEqual({ ...game, legalActions: [] });
  });
  it("prefers the board in board order for tied winners, even if hole cards make an equivalent hand", () => {
    const board = ["Ts", "Jh", "Qd", "Kc", "As"];
    const game = pokerEngineAdapter.publicProjection(playToShowdown(rigged(["Ah", "2c"], ["Ad", "3c"], board)), null);
    expect(game.winnerIds).toHaveLength(2);
    for (const p of game.players) expect(p.winningHand).toEqual({ cards: board, playsBoard: true });
  });
  it("omits cards during active hands and fold wins, even for owners or voluntarily revealed winners", () => {
    const active = startHand();
    expect(pokerEngineAdapter.publicProjection(active, "human", ["ai"]).players.every(p => p.winningHand === null)).toBe(true);
    const folded = pokerEngineAdapter.applyAction(active, currentActor(active), { type: "fold" });
    expect(pokerEngineAdapter.publicProjection(folded, "human", ["human", "ai"]).players.every(p => p.winningHand === null)).toBe(true);
  });
  it("omits legacy winners without evaluation evidence or sufficient hole cards", () => {
    const original = playToShowdown(startHand());
    for (const incomplete of ["rank", "hole"] as const) {
      const state = structuredClone(original);
      // Preserve the engine's deck invariant while simulating incomplete legacy participant data.
      const engine = state.engineState as import("@hivetech/poker-engine").TableState;
      const hand = engine.hand!;
      const legacy = { ...state, engineState: { ...engine, hand: { ...hand, players: hand.players.map(p => ({ ...p,
        ...(incomplete === "rank" ? { handRank: null } : { holeCards: p.holeCards.slice(0, 1) }),
      })), deck: incomplete === "hole" ? [...hand.deck, ...hand.players.flatMap(p => p.holeCards.slice(1))] : hand.deck } } };
      expect(pokerEngineAdapter.publicProjection(legacy, null).players.every(p => p.winningHand === null)).toBe(true);
    }
  });
  it("selects separately for different side-pot recipients and excludes folded players", () => {
    const config: GameConfig = { ...headsUpConfig, players: [
      { id: "short", name: "Short", controller: "human", seat: 0, stack: 100 },
      { id: "deep", name: "Deep", controller: "human", seat: 1, stack: 500 },
      { id: "loser", name: "Loser", controller: "human", seat: 2, stack: 500 },
      { id: "folded", name: "Folded", controller: "human", seat: 3, stack: 500 },
    ] };
    let state = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame(config), createDeterministicDeck([
      "Kh", "Qh", "Jh", "Ah", "Kd", "Qd", "Jd", "Ad", "Tc", "2c", "4s", "7h", "3c", "9d", "5c", "Ts",
    ]));
    while (pokerEngineAdapter.snapshot(state).street !== "complete") {
      const actor = currentActor(state);
      const raise = pokerEngineAdapter.getLegalActions(state).find(a => a.type === "raise");
      state = pokerEngineAdapter.applyAction(state, actor, actor === "folded" ? { type: "fold" } :
        raise?.type === "raise" ? { type: "raise", amount: raise.maxAmount } : passiveAction(state));
    }
    const game = pokerEngineAdapter.publicProjection(state, null, ["folded"]);
    expect(new Set(game.winnerIds)).toEqual(new Set(["short", "deep"]));
    for (const p of game.players) {
      if (game.winnerIds.includes(p.id)) {
        expect(p.winningHand?.cards).toHaveLength(5);
        expect(p.winningHand?.cards.every(c => [...game.communityCards, ...(p.holeCards ?? [])].includes(c))).toBe(true);
      } else expect(p.winningHand).toBeNull();
    }
  });
});
