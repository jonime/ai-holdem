import { describe, expect, it } from "vitest";

import { createPokerAIState, type PokerAIState } from "@/lib/poker/ai-state";
import {
  createDeterministicDeck,
  pokerEngineAdapter,
} from "@/lib/poker/adapter";
import type { GameConfig } from "@/lib/poker/types";

import { decidePokerAction } from "./decision";
import {
  createMoveOptions,
  createPokerDecisionRequest,
  createTypesafeSizingOptions,
  typesafePokerPolicyVersion,
} from "./questions";
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

const limpHistory = [
  {
    sequence: 1,
    street: "preflop" as const,
    action: "call" as const,
    amount: 50,
    player: "You",
    controller: "human" as const,
  },
];

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

function state(options: Partial<Pick<PokerAIState, "difficulty">> = {}) {
  return {
    ...createPokerAIState(aiTurnState(), "typesafe-ai", {
      difficulty: options.difficulty ?? "medium",
      actionHistory: limpHistory,
      equitySamples: 10,
      typesafePolicyV2: true,
    }),
    ...options,
  };
}

function responseFor(
  pokerState: PokerAIState,
  selected: string,
  probabilities?: Readonly<Record<string, number>>,
): unknown {
  const choices = createMoveOptions(pokerState).map((option) => option.choice);
  return {
    model: "jev-latest",
    answers: {
      move: {
        type: "choice",
        choice: selected,
        probabilities:
          probabilities ??
          Object.fromEntries(
            choices.map((choice) => [choice, choice === selected ? 1 : 0]),
          ),
        confidence: 0.8,
      },
    },
  };
}

describe("TypeSafe poker decision", () => {
  it("creates private structured context with corrected numerical labels", () => {
    const pokerState = state({ difficulty: "hard" });

    expect(pokerState.hero).toMatchObject({
      seat: 1,
      controller: "bot",
      handStrength: expect.any(Object),
    });
    expect(pokerState.hero.holeCards).toHaveLength(2);
    expect(pokerState.opponents).toEqual([
      expect.objectContaining({
        seat: 0,
        controller: "human",
        status: "active",
      }),
    ]);
    expect(pokerState.analysis).toMatchObject({
      equityBasis: "random_opponent_hands",
      callCost: 0,
      potOddsToCall: 0,
    });
    expect(JSON.stringify(pokerState)).not.toContain("engineState");
    expect(JSON.stringify(pokerState)).not.toContain("playerToken");
    expect(JSON.stringify(pokerState)).not.toContain('"bot":');
    expect(pokerState.hero).not.toHaveProperty("id");
    expect(pokerState.hero).not.toHaveProperty("name");
    expect(pokerState.opponents[0]).not.toHaveProperty("id");
    expect(pokerState.opponents[0]).not.toHaveProperty("name");
    expect(pokerState.actionHistory).toEqual([
      expect.objectContaining({
        actorSeat: 0,
        actor: "opponent",
        controller: "human",
      }),
    ]);
    expect(pokerState.actionHistory[0]).not.toHaveProperty("player");
  });

  it("asks one complete-move question and removes fold when checking is free", () => {
    const pokerState = state();
    const request = createPokerDecisionRequest(pokerState);
    const choices = Object.keys(request.questions.move.criteria);

    expect(Object.keys(request.questions)).toEqual(["move"]);
    expect(choices).toContain("check");
    expect(choices.some((choice) => choice.startsWith("raise_to_"))).toBe(true);
    expect(choices).not.toContain("fold");
    expect(request.questions.move.instructions).toContain(
      "against random opponent hands",
    );
  });

  it("offers unopened preflop raises at 2, 2.5, and 3 big blinds plus all-in", () => {
    const started = pokerEngineAdapter.startHand(
      pokerEngineAdapter.createGame(gameConfig),
      createDeterministicDeck(),
    );
    const openingState = createPokerAIState(started, "human", {
      equitySamples: 10,
      typesafePolicyV2: true,
    });
    const options = createTypesafeSizingOptions(openingState);

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ choice: "two_big_blinds", amount: 200 }),
        expect.objectContaining({
          choice: "two_and_half_big_blinds",
          amount: 250,
        }),
        expect.objectContaining({ choice: "three_big_blinds", amount: 300 }),
        expect.objectContaining({ choice: "all_in", amount: 10_000 }),
      ]),
    );
    expect(options.every((option) => option.description.includes("additional chips"))).toBe(true);
  });

  it("clamps and deduplicates sizing boundaries while preserving all-in", () => {
    const base = state();
    const bounded: PokerAIState = {
      ...base,
      legalActions: [
        { type: "fold" },
        { type: "call", amount: 100 },
        { type: "raise", minAmount: 240, maxAmount: 250 },
      ],
    };
    const options = createTypesafeSizingOptions(bounded);
    const amounts = options.flatMap((option) =>
      option.amount === null ? [] : [option.amount],
    );

    expect(amounts).toEqual([...new Set(amounts)]);
    expect(amounts.every((amount) => amount >= 240 && amount <= 250)).toBe(true);
    expect(options).toContainEqual(expect.objectContaining({ choice: "all_in", amount: 250 }));
  });

  it("maps every exact candidate to its engine-legal action", async () => {
    const pokerState = state({ difficulty: "hard" });
    for (const candidate of createMoveOptions(pokerState)) {
      const decision = await decidePokerAction(
        { evaluate: async () => responseFor(pokerState, candidate.choice) },
        pokerState,
      );
      expect(decision.action).toEqual(candidate.action);
      expect(decision.candidateChoice).toBe(candidate.choice);
      expect(decision.rawResponse).toMatchObject({
        policyVersion: typesafePokerPolicyVersion,
        decision: {
          selectedCandidate: candidate.choice,
          candidateProbabilities: expect.any(Object),
        },
      });
    }
  });

  it("rejects missing, incomplete, extra, and unavailable response choices", async () => {
    const pokerState = state();
    const choices = createMoveOptions(pokerState).map((option) => option.choice);

    await expect(
      decidePokerAction({ evaluate: async () => ({ answers: {} }) }, pokerState),
    ).rejects.toBeInstanceOf(TypesafeResponseError);
    await expect(
      decidePokerAction(
        {
          evaluate: async () => responseFor(pokerState, choices[0], { [choices[0]]: 1 }),
        },
        pokerState,
      ),
    ).rejects.toBeInstanceOf(TypesafeResponseError);
    await expect(
      decidePokerAction(
        {
          evaluate: async () =>
            responseFor(pokerState, choices[0], {
              ...Object.fromEntries(choices.map((choice) => [choice, choice === choices[0] ? 1 : 0])),
              impossible: 0,
            }),
        },
        pokerState,
      ),
    ).rejects.toBeInstanceOf(TypesafeResponseError);
    await expect(
      decidePokerAction(
        {
          evaluate: async () => ({
            answers: {
              move: {
                type: "choice",
                choice: "fold",
                probabilities: Object.fromEntries(choices.map((choice) => [choice, 1])),
                confidence: 1,
              },
            },
          }),
        },
        pokerState,
      ),
    ).rejects.toBeInstanceOf(TypesafeResponseError);
  });

  it("uses the selected move for medium and hard, and randomizes easy only among filtered moves", async () => {
    const base = state();
    const choices = createMoveOptions(base).map((option) => option.choice);
    const selected = choices.at(-1) as string;
    const probabilities = Object.fromEntries(
      choices.map((choice) => [choice, choice === selected ? 1 : 0]),
    );
    const client = {
      evaluate: async () => responseFor(base, selected, probabilities),
    };

    const medium = await decidePokerAction(client, { ...base, difficulty: "medium" }, { random: () => 0 });
    const hard = await decidePokerAction(client, { ...base, difficulty: "hard" }, { random: () => 0 });
    const easy = await decidePokerAction(client, { ...base, difficulty: "easy" }, { random: () => 0 });

    expect(medium.candidateChoice).toBe(selected);
    expect(hard.candidateChoice).toBe(selected);
    expect(createMoveOptions(base).map((option) => option.choice)).toContain(easy.candidateChoice);
    expect(easy.action.type).not.toBe("fold");
  });

  it("uses the engine's stack-capped call and contestable pot for pot odds", () => {
    const shortConfig: GameConfig = {
      smallBlind: 50,
      bigBlind: 100,
      players: [
        { id: "short", name: "Short", controller: "typesafe_ai", seat: 0, stack: 250 },
        { id: "deep", name: "Deep", controller: "human", seat: 1, stack: 10_000 },
      ],
    };
    let current = pokerEngineAdapter.startHand(
      pokerEngineAdapter.createGame(shortConfig),
      createDeterministicDeck(),
    );
    current = pokerEngineAdapter.applyAction(current, "short", { type: "call", amount: 50 });
    current = pokerEngineAdapter.applyAction(current, "deep", { type: "raise", amount: 500 });
    const pokerState = createPokerAIState(current, "short", {
      equitySamples: 10,
      typesafePolicyV2: true,
    });

    expect(pokerState.legalActions).toContainEqual({ type: "call", amount: 150 });
    expect(pokerState.hero.amountToCall).toBe(150);
    expect(pokerState.analysis).toMatchObject({
      callCost: 150,
      contestablePotAfterCall: 500,
      potOddsToCall: 0.3,
    });
  });
});
