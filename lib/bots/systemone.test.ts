import { describe, expect, it, vi } from "vitest";
import { JevPokerBot } from "./jev";
import { EevoPokerBot, EevoResponseError } from "./eevo";
import { buildScenario, gradeAction, scenarios } from "@/benchmarks/scenarios/harness";
import { createMoveOptions } from "@/lib/systemone/questions";
import type { SystemOneDecisionClient } from "@/lib/systemone/decision";

function answer(choice: string, choices: readonly string[]) {
  return { answers: { move: { type: "choice", choice, confidence: 1,
    probabilities: Object.fromEntries(choices.map(key => [key, Number(key === choice)])) } } };
}
describe.each([ ["Jev", "jev-latest", (client: SystemOneDecisionClient) => new JevPokerBot(client)],
  ["Eevo", "eevo-1", (client: SystemOneDecisionClient) => new EevoPokerBot(client)] ] as const)("%s shared poker policy", (_name, model, create) => {
  it.each(scenarios)("$id preserves engine legality and exact river safeguards", async scenario => {
    const fixture = buildScenario(scenario, { provider: model === "eevo-1" ? "eevo" : "typesafe", typesafePolicyV2: true });
    const { context } = fixture;
    const moves = createMoveOptions(context);
    const evaluate = vi.fn<SystemOneDecisionClient["evaluate"]>(async request => {
      expect(request.model).toBe(model);
      expect(request.state).toMatchObject({ hero: { holeCards: context.hero.holeCards } });
      const supplied = request.state as typeof context;
      expect(supplied.opponents.every(opponent => !("holeCards" in opponent) && !("name" in opponent) && !("id" in opponent))).toBe(true);
      const choices = Object.keys(request.questions.move.criteria);
      expect(choices).toEqual(moves.map(move => move.choice));
      return answer(choices[0], choices);
    });
    const result = await create({ evaluate }).decide(context);
    expect(gradeAction(scenario, fixture, result.action).status).toBe("pass");
    expect(result.diagnostics).toMatchObject({ promptVersion: "typesafe-poker-v4.0", usage: null, cost: null });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
  it.each(["unavailable", "negative", "unknown", "missing", "nan"])("rejects %s responses without substitution", async kind => {
    const { context } = buildScenario(scenarios[0], { typesafePolicyV2: true });
    const evaluate = vi.fn(async () => {
      const choices = createMoveOptions(context).map(move => move.choice);
      const response = answer(choices[0], choices);
      if (kind === "unavailable") response.answers.move.choice = "unavailable";
      if (kind === "negative") response.answers.move.probabilities[choices[0]] = -1;
      if (kind === "nan") response.answers.move.probabilities[choices[0]] = NaN;
      if (kind === "unknown") response.answers.move.probabilities.unknown = 1;
      if (kind === "missing") return {};
      return response;
    });
    await expect(create({ evaluate }).decide(context)).rejects.toMatchObject({ category: "invalid_response" });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
it("Eevo malformed decisions keep their provider identity", async () => {
  const { context } = buildScenario(scenarios[0], { typesafePolicyV2: true });
  await expect(new EevoPokerBot({ evaluate: async () => ({}) }).decide(context)).rejects.toBeInstanceOf(EevoResponseError);
});
