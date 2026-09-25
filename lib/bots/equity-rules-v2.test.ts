import { describe, expect, it } from "vitest";

import type { BotContext } from "./types";
import { EquityRulesV2Bot } from "./equity-rules-v2";

function context(overrides: Partial<BotContext> = {}): BotContext {
  const base: BotContext = {
    difficulty: "medium",
    game: {
      variant: "no_limit_texas_holdem",
      smallBlind: 50,
      bigBlind: 100,
      handNumber: 1,
    },
    hand: { street: "flop", pot: 240, communityCards: ["Ah", "7d", "2c"] },
    hero: {
      seat: 0,
      controller: "bot",
      holeCards: ["Kd", "Qd"],
      position: "button",
      stack: 2000,
      investedThisStreet: 0,
      amountToCall: 0,
      handStrength: {
        madeHand: "high-card",
        bestFive: ["Ad", "Qd", "Kd", "7d", "2c"],
        usesHoleCards: true,
        draws: { flushDraw: false, straightCompletionRanks: [] },
      },
    },
    opponents: [],
    analysis: {
      showdownEquity: 0.72,
      equityBasis: "random_opponent_hands",
      equitySamples: 500,
      callCost: 0,
      contestablePotAfterCall: 240,
      potOddsToCall: 0,
      effectiveStack: 2000,
      stackToPotRatio: 8,
    },
    actionHistory: [],
    legalActions: [
      { type: "check" },
      { type: "bet", minAmount: 80, maxAmount: 600 },
    ],
    sizingOptions: [
      { choice: "one_half_pot", amount: 120, description: "" },
      { choice: "two_thirds_pot", amount: 160, description: "" },
      { choice: "full_pot", amount: 240, description: "" },
    ],
  };
  return { ...base, ...overrides };
}

describe("EquityRulesV2Bot", () => {
  it("returns a single legal action and diagnostics metadata", async () => {
    const bot = new EquityRulesV2Bot();
    const decision = await bot.decide(context());
    expect(decision.action.type).toBe("bet");
    expect(decision.rawResponse).toBeNull();
    expect(decision.diagnostics.matchedRule).not.toBeNull();
    expect(decision.diagnostics.sizing).not.toBeNull();
  });
});
