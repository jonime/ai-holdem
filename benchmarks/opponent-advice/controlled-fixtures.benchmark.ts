import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { verifyFreeze } from "../heads-up/experiment";
import manifest from "./freeze-v2.json";
import { controlledAdviceFixtures, controlledFixtureVersion } from "./controlled-fixtures";
import { evaluatePilot, pilotBots, summarizePilot } from "./pilot";
import { adviceVersion } from "./advice";
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";

it("verifies the corrected 960-decision matrix offline without making paid requests", async () => {
  verifyFreeze(manifest.files);
  vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true"); vi.stubEnv("LLM_API_ENDPOINT", "https://example.invalid"); vi.stubEnv("LLM_API_KEY", "offline");
  let calls = 0;
  const client: TypesafeDecisionClient = { async evaluate(request) {
    calls++; const keys = Object.keys(request.questions.move.criteria), choice = keys.includes("check") ? "check" : "call";
    return { answers: { move: { type: "choice", choice, confidence: 1, probabilities: Object.fromEntries(keys.map(k => [k, Number(k === choice)])) } } };
  } };
  try {
    const bots = pilotBots(client, async (_url, init) => {
      calls++; const request = JSON.parse(String(init.body)), keys = request.response_format.json_schema.schema.properties.action.enum;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ action: keys.includes("check") ? "check" : "call", sizing: null }) } }] });
    });
    const rows = await evaluatePilot(bots, controlledAdviceFixtures(5));
    const summary = summarizePilot(rows);
    mkdirSync("benchmarks/results", { recursive: true });
    writeFileSync("benchmarks/results/opponent-advice-v2-offline.json", JSON.stringify({ fixtureVersion: controlledFixtureVersion, adviceVersion, paidRequests: 0, scriptedProviderOutputs: true, calls, rows, summary }, null, 2) + "\n");
    expect(calls).toBe(960); expect(rows).toHaveLength(960); expect(summary.failures).toBe(0);
  } finally { vi.unstubAllEnvs(); }
});
