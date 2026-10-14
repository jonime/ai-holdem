import { expect, it, vi } from "vitest";
import { ConfidenceAwareJevPokerBot, jevConfidencePolicyVersion } from "./jev-confidence";
import { ServerBotRegistry } from "./registry";
import { JevPokerBot } from "./jev";
import { EevoPokerBot } from "./eevo";
import { controlledAdviceFixtures } from "@/benchmarks/opponent-advice/controlled-fixtures";
import { selectJevOpponentAdvice, tendency, wilson95 } from "@/lib/poker/opponent-advice";
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";

const fixtures = controlledAdviceFixtures(5);
function client() {
  return { evaluate: vi.fn<TypesafeDecisionClient["evaluate"]>(async request => {
    const choices = Object.keys(request.questions.move.criteria);
    const choice = choices.includes("check") ? "check" : choices.includes("call") ? "call" : choices[0];
    return { answers: { move: { type: "choice", choice, confidence: 1, probabilities: Object.fromEntries(choices.map(k => [k, Number(k === choice)])) } } };
  }) };
}
it("production registry enables confidence advice only for Jev", () => {
  const registry = new ServerBotRegistry();
  expect(registry.get({ botId: "jev" }).bot).toBeInstanceOf(ConfidenceAwareJevPokerBot);
  expect(registry.get({ botId: "eevo" }).bot).toBeInstanceOf(EevoPokerBot);
});
it("uses one request with unchanged candidates, model, questions and river protections", async () => {
  const f = fixtures.find(f => f.id === "HU-river")!;
  const currentClient = client(), productionClient = client();
  const baseline = await new JevPokerBot(currentClient).decide(f.contexts.folding);
  const promoted = await new ConfidenceAwareJevPokerBot(productionClient).decide(f.contexts.folding);
  expect(productionClient.evaluate).toHaveBeenCalledTimes(1);
  const current = currentClient.evaluate.mock.calls[0][0], actual = productionClient.evaluate.mock.calls[0][0];
  expect(actual.model).toBe(current.model); expect(actual.questions).toEqual(current.questions);
  expect(actual.state).toHaveProperty("legalActions", f.contexts.folding.legalActions);
  expect(current.state).toHaveProperty("legalActions", f.contexts.folding.legalActions);
  expect(actual.state).toHaveProperty("sizingOptions", f.contexts.folding.sizingOptions);
  expect(current.state).toHaveProperty("sizingOptions", f.contexts.folding.sizingOptions);
  expect(actual.state).toHaveProperty("opponentAdvice.version", "jev-opponent-advice-v2");
  expect(promoted.suppliedContext).toHaveProperty("opponentAdvice");
  expect(promoted.action).toEqual(baseline.action);
  expect(promoted.diagnostics.promptVersion).toBe(jevConfidencePolicyVersion);
  expect(JSON.stringify(actual.state)).not.toMatch(/playerToken|fixture-\d|engineState|finalState/);
});
it("adds no tendency advice for omitted, sparse, unknown or unsupported multiway preflop evidence", () => {
  for (const f of fixtures) {
    expect(selectJevOpponentAdvice(f.contexts.omitted)).toEqual([]);
    expect(selectJevOpponentAdvice(f.contexts.insufficient)).toEqual([]);
    if (f.id.startsWith("MW-preflop")) expect(selectJevOpponentAdvice(f.contexts.folding)).toEqual([]);
    expect(selectJevOpponentAdvice({ ...f.contexts.folding, situation: { ...f.contexts.folding.situation!, historyStatus: "unknown" } })).toEqual([]);
  }
});
it("matches street and size buckets without interpreting counts as evidence for all-in sizing", () => {
  const small = fixtures.find(f => f.id === "HU-preflop-small")!;
  const advice = selectJevOpponentAdvice(small.contexts.folding);
  expect(advice.length).toBeGreaterThan(0);
  expect(advice.every(a => a.sizing !== "all_in" && a.metric === "bbSmallOpenFold")).toBe(true);
  const large = fixtures.find(f => f.id === "HU-preflop-large")!;
  expect(selectJevOpponentAdvice(large.contexts.folding)).toEqual([]);
  const flop = fixtures.find(f => f.id === "MW-flop-made")!;
  const items = selectJevOpponentAdvice(flop.contexts.folding);
  expect(items).toHaveLength(1); expect(items[0].seat).toBe(flop.target);
  expect(items[0].text).toContain("More pressure does not mean larger sizing");
  expect(items[0].text).toContain("not the current action's fold probability");
  expect(items[0].text).toContain("rather than automatically reducing value bets");
  expect(selectJevOpponentAdvice({ ...flop.contexts.folding, opponents: flop.contexts.folding.opponents.map(p => ({ ...p, status: "all_in" })) })).toEqual([]);
});
it("retains minimum observations and strict Wilson uncertainty thresholds", () => {
  const make = (count: number, opportunities: number) => ({ count, opportunities, rate: count / opportunities, evidence: "observed" as const });
  expect(wilson95(5, 10)![0]).toBeCloseTo(.236593, 5);
  expect(tendency(make(9, 9))).toBeNull(); expect(tendency(make(9, 10))).toBeNull();
  expect(tendency(make(10, 10))?.kind).toBe("frequent_folding");
  expect(tendency(make(0, 10))?.kind).toBe("frequent_continuation");
  expect(tendency(make(1, 10))).toBeNull();
  expect(() => wilson95(11, 10)).toThrow();
});
