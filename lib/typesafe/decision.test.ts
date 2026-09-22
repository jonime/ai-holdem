import { describe, expect, it } from "vitest";

import { createPokerAIState } from "@/lib/poker/ai-state";
import {
  createDeterministicDeck,
  pokerEngineAdapter,
} from "@/lib/poker/adapter";
import type { GameConfig } from "@/lib/poker/types";

import { decidePokerAction } from "./decision";
import { createPokerDecisionRequest } from "./questions";
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

function response(action: string, sizing = "medium"): unknown {
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
        probabilities: { small: 0.1, medium: 0.6, large: 0.2, all_in: 0.1 },
        confidence: 0.6,
      },
    },
  };
}

describe("TypeSafe poker decision", () => {
  it("creates structured state without opponent hole cards", () => {
    const state = createPokerAIState(aiTurnState(), "typesafe-ai");

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
    const request = createPokerDecisionRequest(
      createPokerAIState(aiTurnState(), "typesafe-ai"),
    );

    expect(request.questions.action.criteria).toEqual({
      check: expect.any(String),
      fold: expect.any(String),
      raise: expect.any(String),
    });
  });

  it("converts a valid raise choice into a legal engine action", async () => {
    const state = createPokerAIState(aiTurnState(), "typesafe-ai");
    const decision = await decidePokerAction(
      { evaluate: async () => response("raise", "medium") },
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
    expect(decision.sizing?.choice).toBe("medium");
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
});
