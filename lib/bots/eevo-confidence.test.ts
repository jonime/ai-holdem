import { expect, it, vi } from "vitest";
import { ConfidenceAwareEevoPokerBot, eevoConfidencePolicyVersion } from "./eevo-confidence";
import { ConfidenceAwareJevPokerBot } from "./jev-confidence";
import { EevoPokerBot, EevoResponseError } from "./eevo";
import { controlledAdviceFixtures } from "@/benchmarks/opponent-advice/controlled-fixtures";
import { BotProviderError } from "./types";
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";

const fixtures = controlledAdviceFixtures(5);
function client() {
  return { evaluate: vi.fn<TypesafeDecisionClient["evaluate"]>(async request => {
    const choices = Object.keys(request.questions.move.criteria);
    const choice = choices.includes("check") ? "check" : choices.includes("call") ? "call" : choices[0];
    return { answers: { move: { type: "choice", choice, confidence: 1, probabilities: Object.fromEntries(choices.map(k => [k, Number(k === choice)])) } } };
  }) };
}
it("Eevo and Jev share the exact advice and candidates with distinct model/policy identifiers", async () => {
  const context = fixtures.find(f => f.id === "HU-river")!.contexts.folding;
  const eevo = client(), jev = client(), baseline = client();
  const decision = await new ConfidenceAwareEevoPokerBot(eevo).decide(context);
  await new ConfidenceAwareJevPokerBot(jev).decide(context);
  await new EevoPokerBot(baseline).decide(context);
  expect(eevo.evaluate).toHaveBeenCalledTimes(1);
  const request = eevo.evaluate.mock.calls[0][0];
  expect(request.model).toBe("eevo-1");
  expect(request.state).toEqual(jev.evaluate.mock.calls[0][0].state);
  expect(request.questions).toEqual(baseline.evaluate.mock.calls[0][0].questions);
  expect(request.state).toHaveProperty("legalActions", context.legalActions);
  expect(request.state).toHaveProperty("sizingOptions", context.sizingOptions);
  expect(request.state).toHaveProperty("opponentAdvice.version", "jev-opponent-advice-v2");
  expect(decision.suppliedContext).toHaveProperty("opponentAdvice");
  expect(decision.diagnostics.promptVersion).toBe(eevoConfidencePolicyVersion);
  expect(JSON.stringify(request.state)).not.toMatch(/playerToken|fixture-\d|engineState|finalState/);
});
it("adds no tendency advice for sparse, omitted or unknown observations", async () => {
  const f = fixtures.find(f => f.id === "HU-flop-draw")!;
  for (const context of [f.contexts.omitted, f.contexts.insufficient, { ...f.contexts.folding, situation: { ...f.contexts.folding.situation!, historyStatus: "unknown" as const } }]) {
    const c = client(); await new ConfidenceAwareEevoPokerBot(c).decide(context);
    expect(c.evaluate.mock.calls[0][0].state).not.toHaveProperty("opponentAdvice");
    expect(c.evaluate).toHaveBeenCalledTimes(1);
  }
});
it("preserves Eevo response errors and provider failures without fallback or a second request", async () => {
  const context = fixtures[0].contexts.omitted;
  const malformed = { evaluate: vi.fn(async () => ({ answers: {} })) };
  await expect(new ConfidenceAwareEevoPokerBot(malformed).decide(context)).rejects.toBeInstanceOf(EevoResponseError);
  expect(malformed.evaluate).toHaveBeenCalledTimes(1);
  const failure = new BotProviderError("network", undefined, { category: "network" });
  const failed = { evaluate: vi.fn(async () => { throw failure; }) };
  await expect(new ConfidenceAwareEevoPokerBot(failed).decide(context)).rejects.toBe(failure);
  expect(failed.evaluate).toHaveBeenCalledTimes(1);
});
it("retains sizing cautions and targets only the observed opponent in multiway contexts", async () => {
  const f = fixtures.find(f => f.id === "MW-flop-made")!, c = client();
  await new ConfidenceAwareEevoPokerBot(c).decide(f.contexts.folding);
  expect(c.evaluate.mock.calls[0][0].state).toHaveProperty("opponentAdvice.items", expect.arrayContaining([
    expect.objectContaining({ seat: f.target, text: expect.stringContaining("Do not justify an all-in") }),
  ]));
});
