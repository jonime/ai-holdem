import { describe, expect, it } from "vitest";

import type { BotContext } from "./types";
import { BasicEquityBot } from "./basic-equity";

function context(
  equity: number,
  potOdds: number,
  legalActions: BotContext["legalActions"],
  sizingOptions: BotContext["sizingOptions"] = [],
): BotContext {
  return {
    difficulty: "medium",
    game: {
      variant: "no_limit_texas_holdem",
      smallBlind: 50,
      bigBlind: 100,
      handNumber: 1,
    },
    hand: { street: "flop", pot: 1_000, communityCards: ["As", "7d", "2c"] },
    hero: {
      holeCards: ["Ah", "Kd"],
      position: "button",
      stack: 5_000,
      investedThisStreet: 0,
      amountToCall: 0,
    },
    opponents: [],
    analysis: {
      showdownEquity: equity,
      equitySamples: 5_000,
      potOddsToCall: potOdds,
      effectiveStack: 5_000,
      stackToPotRatio: 5,
    },
    actionHistory: [],
    legalActions,
    sizingOptions,
  };
}

describe("basic-equity-v1", () => {
  const bot = new BasicEquityBot();

  it("bets at seventy percent equity using the shared size closest to half pot", async () => {
    const decision = await bot.decide(
      context(
        0.7,
        0,
        [{ type: "check" }, { type: "bet", minAmount: 200, maxAmount: 1_000 }],
        [
          { choice: "one_third_pot", amount: 400, description: "400" },
          { choice: "two_thirds_pot", amount: 600, description: "600" },
        ],
      ),
    );
    expect(decision.action).toEqual({ type: "bet", amount: 400 });
    expect(decision.diagnostics.matchedRule).toContain("seventy-percent");
  });

  it("checks below the value threshold", async () => {
    const decision = await bot.decide(context(0.69, 0, [{ type: "check" }]));
    expect(decision.action).toEqual({ type: "check" });
  });

  it("calls only at pot odds plus five percentage points", async () => {
    const call = { type: "call" as const, amount: 250 };
    await expect(bot.decide(context(0.3, 0.25, [{ type: "fold" }, call])))
      .resolves.toMatchObject({ action: call });
    await expect(bot.decide(context(0.2999, 0.25, [{ type: "fold" }, call])))
      .resolves.toMatchObject({ action: { type: "fold" } });
  });

  it("uses a clamped shared size for a short stack", async () => {
    const decision = await bot.decide(
      context(
        0.9,
        0.2,
        [
          { type: "fold" },
          { type: "call", amount: 800 },
          { type: "raise", minAmount: 1_200, maxAmount: 1_300 },
        ],
        [{ choice: "one_third_pot", amount: 1_200, description: "clamped" }],
      ),
    );
    expect(decision.action).toEqual({ type: "raise", amount: 1_200 });
  });
});
