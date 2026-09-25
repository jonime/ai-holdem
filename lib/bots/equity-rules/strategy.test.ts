import { describe, expect, it } from "vitest";

import type { BotContext } from "../types";
import { decideRulesAction, rulesProfiles } from "./strategy";

function makeContext(overrides: Partial<BotContext> = {}): BotContext {
  const base: BotContext = {
    difficulty: "medium",
    game: {
      variant: "no_limit_texas_holdem",
      smallBlind: 50,
      bigBlind: 100,
      handNumber: 1,
    },
    hand: { street: "flop", pot: 200, communityCards: ["Ah", "7d", "2c"] },
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
      showdownEquity: 0.65,
      equityBasis: "random_opponent_hands",
      equitySamples: 1000,
      callCost: 0,
      contestablePotAfterCall: 200,
      potOddsToCall: 0,
      effectiveStack: 2000,
      stackToPotRatio: 10,
    },
    actionHistory: [],
    legalActions: [
      { type: "check" },
      { type: "bet", minAmount: 100, maxAmount: 500 },
    ],
    sizingOptions: [
      { choice: "one_third_pot", amount: 100, description: "" },
      { choice: "one_half_pot", amount: 150, description: "" },
      { choice: "full_pot", amount: 200, description: "" },
    ],
  };
  return { ...base, ...overrides };
}

describe("equity rules strategy", () => {
  it("returns a legal aggressive action for strong value spots", async () => {
    const decision = decideRulesAction(makeContext(), rulesProfiles.medium);
    expect(decision.action.type).toBe("bet");
    if (decision.action.type !== "bet" && decision.action.type !== "raise") {
      throw new Error("Expected an aggressive legal action");
    }
    expect(decision.action.amount).toBeGreaterThanOrEqual(100);
  });

  it("prefers a check when no aggression rule wins", () => {
    const decision = decideRulesAction(
      makeContext({
        analysis: { ...makeContext().analysis, showdownEquity: 0.15 },
        legalActions: [{ type: "check" }],
      }),
      rulesProfiles.easy,
    );
    expect(decision.action.type).toBe("check");
  });

  it("keeps bluffing deterministic and profile-gated", () => {
    expect(rulesProfiles.easy.bluffEnabled).toBe(false);
    expect(rulesProfiles.hard.bluffEnabled).toBe(true);
  });
});
