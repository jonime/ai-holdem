import { describe, expect, it } from "vitest";
import { legacyDecisionHistory } from "@/lib/poker/bot-history";
import { createLegacySizingOptions, createSizingOptions } from "@/lib/typesafe/questions";
import { pokerEngineAdapter } from "@/lib/poker/adapter";
import { emptyDiagnostics } from "@/lib/bots/types";
import { buildScenario, evaluateScenario, gradeAction, scenarios, riverScenarios } from "./harness";

describe("engine-backed bot scenarios", () => {
  for (const river of riverScenarios) {
    it(`${river.id}: verifies cards, replay, privacy, and the failure oracle`, () => {
      const scenario = scenarios.find(s => s.id === river.id)!;
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
      if (river.riverAction === "shove") {
        const completed = pokerEngineAdapter.snapshot(
          pokerEngineAdapter.applyAction(fixture.state, fixture.heroId, passive),
        );
        expect(completed.street).toBe("complete");
        expect(completed.winnerAmounts).toEqual(
          river.showdown === "split"
            ? { "seat-0": 200, "seat-1": 200 }
            : river.showdown === "win" ? { "seat-0": 400 } : { "seat-1": 400 },
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

  for (const scenario of scenarios.slice(8)) {
    it(`${scenario.id}: asserts the intended visible state and accepts alternatives`, () => {
      const fixture = buildScenario(scenario);
      expect(fixture.context.analysis.equitySamples).toBe(5000);
      expect(fixture.context.situation?.historyStatus).toBe("complete");
      expect(fixture.context.actionHistory).toHaveLength(scenario.actions.length);
      expect(fixture.context.sizingOptions).toEqual(createLegacySizingOptions(fixture.context));
      expect(fixture.context.actionHistory).toEqual(legacyDecisionHistory(fixture.context.actionHistory));
      for (const opponent of fixture.context.opponents) expect(opponent).not.toHaveProperty("holeCards");
      expect(gradeAction(scenario, fixture, { type: "bet", amount: 1_000_000 }).status).toBe("illegal");
      for (const legal of fixture.context.legalActions) {
        const action = legal.type === "bet" || legal.type === "raise"
          ? { type: legal.type, amount: legal.minAmount } : legal;
        expect(gradeAction(scenario, fixture, action).status).toBe(scenario.forbidden.includes(action.type) ? "blunder" : "pass");
      }
      // Mutate every fixed hidden holding and append different undealt cards.
      // Keep hero and public board fixed: neither sampling nor history may change.
      const visible = new Set([...scenario.expected.hole, ...scenario.expected.board]);
      const hiddenIndexes = scenario.deck.map((card, i) => visible.has(card) ? -1 : i).filter(i => i >= 0);
      const changed = [...scenario.deck];
      const replacements = hiddenIndexes.map(i => changed[i]).reverse();
      hiddenIndexes.forEach((index, i) => { changed[index] = replacements[i]; });
      const unused = ["As", "Ks", "Qs", "Js", "Ts", "9s", "8s", "7s", "6s", "5s", "4s", "3s", "2s"].filter(card => !changed.includes(card));
      expect(buildScenario({ ...scenario, deck: [...changed, ...unused] }).context).toEqual(fixture.context);
      for (const provider of ["typesafe", "llm"] as const) {
        const context = buildScenario(scenario, { provider }).context;
        expect(context.hand.pot).toBe(scenario.expected.pot);
        expect(context.hero.amountToCall).toBe(context.analysis.callCost);
        expect(context.sizingOptions).toEqual(createSizingOptions(context));
        expect(context.actionHistory.length).toBe(scenario.actions.length);
        expect(buildScenario({ ...scenario, deck: [...changed, ...unused] }, { provider }).context).toEqual(context);
      }
    }, 15_000);
  }

  it("supports four and five seats as well as the two, three and six-seat fixtures", () => {
    const six = scenarios[8];
    for (const count of [4, 5]) {
      const removed = count === 4 ? [3, 4, 9, 10] : [4, 10];
      const fixture = buildScenario({ ...six, stacks: six.stacks.slice(0, count),
        deck: six.deck.filter((_, index) => !removed.includes(index)),
        expected: { ...six.expected, stacks: six.expected.stacks.slice(0, count) } });
      expect(fixture.context.opponents).toHaveLength(count - 1);
    }
    for (const count of [1, 7]) expect(() => buildScenario({ ...six, stacks: Array(count).fill(100) })).toThrow("2–6 seats");
  });

  it("retains visible all-in and multiway eligibility facts", () => {
    const fixture = buildScenario(scenarios.find(s => s.id === "turn-multiway-side-pot")!);
    expect(fixture.context.opponents.map(p => p.status)).toEqual(["all_in", "active"]);
    expect(fixture.context.situation?.activeOpponentCount).toBe(2);
    expect(fixture.context.analysis.callCost).toBe(20);
    expect(fixture.context.analysis.contestablePotAfterCall).toBe(70);
  });

  it("rejects incorrect fixture assertions and replay actors before evaluation", () => {
    const scenario = scenarios[8];
    expect(() => buildScenario({ ...scenario, hero: 4 })).toThrow("Unexpected scenario hero");
    expect(() => buildScenario({ ...scenario, expected: { ...scenario.expected, pot: 999 } })).toThrow("pot");
    expect(() => buildScenario({ ...scenario, actions: [{ seat: 4, action: { type: "fold" } }] })).toThrow("unexpected replay actor");
  });

  it("distinguishes provider failures and legal blunders from passes", async () => {
    expect((await evaluateScenario({ decide: async () => { throw new Error("secret"); } }, scenarios[0])).status).toBe("provider-error");
    expect((await evaluateScenario({ decide: async () => ({ action: { type: "raise", amount: 1_000_000 }, diagnostics: emptyDiagnostics(), rawResponse: null }) }, scenarios[0])).status).toBe("illegal");
    expect((await evaluateScenario({ decide: async () => ({ action: { type: "check" }, diagnostics: emptyDiagnostics(), rawResponse: null }) }, scenarios[0])).status).toBe("pass");
    expect((await evaluateScenario({ decide: async () => ({ action: { type: "fold" }, diagnostics: emptyDiagnostics(), rawResponse: null }) }, scenarios[0])).status).toBe("blunder");
  });
});
