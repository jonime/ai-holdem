import { describe, expect, it } from "vitest";
import { pokerEngineAdapter } from "@/lib/poker/adapter";
import { emptyDiagnostics } from "@/lib/bots/types";
import { buildScenario, evaluateScenario, gradeAction, scenarios } from "./harness";

describe("engine-backed bot scenarios", () => {
  for (const scenario of scenarios) {
    it(`${scenario.id}: verifies cards, replay, privacy, and the failure oracle`, () => {
      const fixture = buildScenario(scenario);
      expect(fixture.context.hand.street).toBe("river");
      expect(fixture.context.hero.holeCards).toEqual([scenario.deck[1], scenario.deck[3]]);
      expect(fixture.context.hand.communityCards).toEqual([scenario.deck[5], scenario.deck[6], scenario.deck[7], scenario.deck[9], scenario.deck[11]]);
      expect(fixture.context.opponents[0]).not.toHaveProperty("holeCards");
      expect(fixture.context.actionHistory).toHaveLength(7);
      expect(buildScenario(scenario)).toEqual(fixture);
      expect(gradeAction(scenario, fixture, { type: "fold" }).status).toBe(scenario.forbidden.includes("fold") ? "blunder" : "pass");
      expect(gradeAction(scenario, fixture, { type: "raise", amount: 1_000_000 }).status).toBe("illegal");
      const passive = fixture.context.legalActions.find((action) => action.type === "call" || action.type === "check");
      if (!passive || (passive.type !== "call" && passive.type !== "check")) throw new Error("Missing passive action");
      expect(gradeAction(scenario, fixture, passive).status).toBe(scenario.forbidden.includes(passive.type) ? "blunder" : "pass");
      if (scenario.riverAction === "shove") {
        const completed = pokerEngineAdapter.snapshot(
          pokerEngineAdapter.applyAction(fixture.state, fixture.heroId, passive),
        );
        expect(completed.street).toBe("complete");
        expect(completed.winnerAmounts).toEqual(
          scenario.showdown === "split"
            ? { "seat-0": 200, "seat-1": 200 }
            : scenario.showdown === "win" ? { "seat-0": 400 } : { "seat-1": 400 },
        );
        const typesafe = buildScenario(scenario, { typesafePolicyV2: true });
        expect(typesafe.context.analysis.potOddsToCall).toBe(0.495);
      }
      if (scenario.id.startsWith("royal-flush")) expect(fixture.context.analysis.showdownEquity).toBe(1);
      if (scenario.id.startsWith("royal-board")) {
        expect(fixture.context.analysis.showdownEquity).toBe(0.5);
        expect(fixture.context.analysis.callCost / fixture.context.analysis.contestablePotAfterCall).toBeLessThan(0.5);
      }
    });
  }

  it("distinguishes provider failures and legal blunders from passes", async () => {
    expect((await evaluateScenario({ decide: async () => { throw new Error("secret"); } }, scenarios[0])).status).toBe("provider-error");
    expect((await evaluateScenario({ decide: async () => ({ action: { type: "fold" }, diagnostics: emptyDiagnostics(), rawResponse: null }) }, scenarios[0])).status).toBe("blunder");
  });
});
