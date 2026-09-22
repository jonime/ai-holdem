import { describe, expect, it } from "vitest";

import { createPokerAIState } from "@/lib/poker/ai-state";
import {
  createDeterministicDeck,
  pokerEngineAdapter,
} from "@/lib/poker/adapter";
import type { GameConfig } from "@/lib/poker/types";

import { decidePokerAction } from "./decision";
import { createPokerDecisionRequest, createSizingOptions } from "./questions";
import { TypesafeResponseError } from "./types";

const gameConfig: GameConfig = {
  smallBlind: 50,
  bigBlind: 100,
  players: [
    { id: "human", name: "You", controller: "human", seat: 0, stack: 10_000 },
    {
      id: "typesafe-ai",
      name: "TypeSafe AI",
      controller: "typesafe_ai",
      seat: 1,
      stack: 10_000,
    },
  ],
};

function aiTurnState() {
  const started = pokerEngineAdapter.startHand(
    pokerEngineAdapter.createGame(gameConfig),
    createDeterministicDeck(),
  );
  return pokerEngineAdapter.applyAction(started, "human", {
    type: "call",
    amount: 50,
  });
}

function response(action: string, sizing = "one_third_pot"): unknown {
  return {
    model: "jev-latest",
    answers: {
      action: {
        type: "choice",
        choice: action,
        probabilities: { fold: 0.1, check: 0.6, raise: 0.3 },
        confidence: 0.6,
      },
      sizing: {
        type: "choice",
        choice: sizing,
        probabilities: {
          one_third_pot: 0.6,
          one_half_pot: 0.2,
          two_thirds_pot: 0.1,
          full_pot: 0.05,
          all_in: 0.05,
        },
        confidence: 0.6,
      },
    },
  };
}

describe("TypeSafe poker decision", () => {
  it("creates structured state without opponent hole cards", () => {
    const state = createPokerAIState(aiTurnState(), "typesafe-ai", {
      difficulty: "hard",
    });

    expect(state.hero.holeCards).toHaveLength(2);
    expect(state.opponents).toEqual([
      expect.objectContaining({ id: "human", status: "active" }),
    ]);
    expect(JSON.stringify(state)).not.toContain("engineState");
    expect(JSON.stringify(state)).not.toContain('holeCards":[]');
    expect(state.legalActions.map((action) => action.type)).toEqual([
      "fold",
      "check",
      "raise",
    ]);
  });

  it("asks only for current legal action criteria", () => {
    const state = createPokerAIState(aiTurnState(), "typesafe-ai", {
      actionHistory: [
        {
          sequence: 1,
          street: "preflop",
          action: "call",
          amount: 50,
          player: "You",
          controller: "human",
        },
      ],
    });
    const request = createPokerDecisionRequest(state);

    expect(request.questions.action.criteria).toEqual({
      check: expect.any(String),
      fold: expect.any(String),
      raise: expect.any(String),
    });
    expect(state.actionHistory).toHaveLength(1);
    expect(state.analysis.showdownEquity).toBeGreaterThan(0);
    expect(JSON.stringify(state)).not.toContain("playerToken");
  });

  it("creates unique, legal, pot-relative sizing choices", () => {
    const state = createPokerAIState(aiTurnState(), "typesafe-ai", {
      equitySamples: 10,
    });
    const raise = state.legalActions.find((action) => action.type === "raise");
    if (raise?.type !== "raise") throw new Error("Expected a legal raise");
    const options = createSizingOptions(state);
    const amounts = options.flatMap((option) =>
      option.amount === null ? [] : [option.amount],
    );

    expect(new Set(amounts).size).toBe(amounts.length);
    expect(amounts.every((amount) => amount >= raise.minAmount)).toBe(true);
    expect(amounts.every((amount) => amount <= raise.maxAmount)).toBe(true);
    expect(options.some((option) => option.description.includes("exactly"))).toBe(
      true,
    );
  });

  it("converts a valid raise choice into a legal engine action", async () => {
    const state = createPokerAIState(aiTurnState(), "typesafe-ai", {
      difficulty: "hard",
    });
    const decision = await decidePokerAction(
      { evaluate: async () => response("raise", "one_third_pot") },
      state,
    );

    expect(decision.action.type).toBe("raise");
    if (decision.action.type !== "raise")
      throw new Error("Expected raise action");
    const legalRaise = state.legalActions.find(
      (action) => action.type === "raise",
    );
    expect(legalRaise?.type).toBe("raise");
    if (legalRaise?.type !== "raise") throw new Error("Expected legal raise");
    expect(decision.action.amount).toBeGreaterThanOrEqual(legalRaise.minAmount);
    expect(decision.action.amount).toBeLessThanOrEqual(legalRaise.maxAmount);
    expect(decision.sizing?.choice).toBe("one_third_pot");
  });

  it("rejects unavailable actions and malformed responses", async () => {
    const state = createPokerAIState(aiTurnState(), "typesafe-ai");

    await expect(
      decidePokerAction({ evaluate: async () => response("bet") }, state),
    ).rejects.toBeInstanceOf(TypesafeResponseError);
    await expect(
      decidePokerAction({ evaluate: async () => ({ answers: {} }) }, state),
    ).rejects.toBeInstanceOf(TypesafeResponseError);
  });

  it("uses difficulty to control probability sampling", async () => {
    const base = createPokerAIState(aiTurnState(), "typesafe-ai", {
      equitySamples: 10,
    });
    const probabilisticResponse = {
      answers: {
        action: {
          type: "choice",
          choice: "check",
          probabilities: { fold: 0, check: 0.25, raise: 0.75 },
          confidence: 0.8,
        },
        sizing: {
          type: "choice",
          choice: "one_third_pot",
          probabilities: { one_third_pot: 1 },
          confidence: 1,
        },
      },
    };
    const client = { evaluate: async () => probabilisticResponse };

    const hard = await decidePokerAction(
      client,
      { ...base, difficulty: "hard" },
      { random: () => 0.99 },
    );
    const medium = await decidePokerAction(
      client,
      { ...base, difficulty: "medium" },
      { random: () => 0.99 },
    );
    const easy = await decidePokerAction(
      client,
      { ...base, difficulty: "easy" },
      { random: () => 0.01 },
    );

    expect(hard.action.type).toBe("check");
    expect(medium.action.type).toBe("raise");
    expect(easy.action.type).toBe("fold");
  });
});
