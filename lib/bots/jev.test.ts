import { expect, it, vi } from "vitest";
import { JevPokerBot } from "./jev";
import { buildPreflopNode, preflopNodes } from "@/benchmarks/poker-context-harness";
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";

it("supplies shared heads-up advice with the same complete-move output contract", async () => {
  const evaluate = vi.fn<TypesafeDecisionClient["evaluate"]>(async request => {
    const criteria = request.questions.move.criteria;
    const choice = "call" in criteria ? "call" : Object.keys(criteria)[0];
    return { answers: { move: { type: "choice", choice, probabilities: Object.fromEntries(Object.keys(criteria).map(key => [key, key === choice ? 1 : 0])), confidence: 1 } } };
  });
  const context = buildPreflopNode(preflopNodes.find(node => node.id === "HU-open")!, ["As", "Ks"]).context;
  const decision = await new JevPokerBot({ evaluate }).decide(context);
  expect(decision.suppliedContext).toMatchObject({ strategyAdvice: { version: "poker-advice-v2", scope: "heads_up" } });
  const request = evaluate.mock.calls[0][0];
  expect(request.model).toBe("jev-latest");
  expect(Object.keys(request.questions)).toEqual(["move"]);
  expect(request.questions.move.instructions).toContain("variance alone is not a reason");
  expect(request.questions.move.instructions).not.toContain("avoid unnecessary variance");
  expect(decision.diagnostics.promptVersion).toBe("typesafe-poker-v4.0");
});
