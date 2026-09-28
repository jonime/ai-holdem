import { describe, expect, it } from "vitest";
import { buildScenario, gradeAction, scenarios } from "@/benchmarks/scenarios/harness";
import { decidePokerAction } from "./decision";
import { createMoveOptions, createPokerDecisionRequest } from "./questions";
import { TypesafeResponseError } from "./types";

describe("Jev river candidate safeguards", () => {
  for (const scenario of scenarios) {
    it(`${scenario.id}: offers only legal, non-blundering candidates`, () => {
      const fixture = buildScenario(scenario, { typesafePolicyV2: true });
      const moves = createMoveOptions(fixture.context);
      expect(moves.length).toBeGreaterThan(0);
      expect(Object.keys(createPokerDecisionRequest(fixture.context).questions.move.criteria))
        .toEqual(moves.map((move) => move.choice));
      for (const move of moves) {
        expect(gradeAction(scenario, fixture, move.action).status).toBe("pass");
      }
    });
  }

  it("keeps fold and call available for a beatable ace-high flush even if sampled equity says 1", () => {
    const fixture = buildScenario({
      ...scenarios[2],
      deck: ["Kc", "As", "Kd", "2d", "3c", "9s", "8s", "7s", "4c", "6s", "5c", "Kh"],
    }, { typesafePolicyV2: true });
    const context = { ...fixture.context, analysis: { ...fixture.context.analysis, showdownEquity: 1 } };
    expect(createMoveOptions(context).map((move) => move.choice)).toEqual(["fold", "call"]);
  });

  it("does not apply heads-up proofs to multiway contexts", () => {
    const { context } = buildScenario(scenarios[3], { typesafePolicyV2: true });
    const multiway = { ...context, opponents: [...context.opponents, { ...context.opponents[0], seat: 2 }] };
    expect(createMoveOptions(multiway).map((move) => move.choice)).toContain("fold");
  });

  it("rejects a provider choosing a removed move rather than silently substituting an action", async () => {
    const { context } = buildScenario(scenarios[3], { typesafePolicyV2: true });
    await expect(decidePokerAction({ evaluate: async () => ({ answers: { move: {
      type: "choice", choice: "fold", confidence: 1, probabilities: { fold: 1, call: 0 },
    } } }) }, context)).rejects.toBeInstanceOf(TypesafeResponseError);
  });
});
