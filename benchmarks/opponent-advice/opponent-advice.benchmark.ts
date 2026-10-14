import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { TypesafeSystemOneClient } from "@/lib/typesafe/client";
import { verifyFreeze } from "../heads-up/experiment";
import manifest from "./freeze.json";
import { adviceFixtures, fixtureVersion } from "./fixtures";
import { adviceVersion } from "./advice";
import { evaluatePilot, pilotBots, preflight, livePilotBots, summarizePilot, model } from "./pilot";

function save(path: string, report: unknown) { mkdirSync("benchmarks/results", { recursive: true }); writeFileSync(path, JSON.stringify(report, null, 2) + "\n"); }
describe("confidence-aware opponent advice", () => {
  it("runs the complete offline 960-decision wiring matrix", async () => {
    verifyFreeze(manifest.files);
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true"); vi.stubEnv("LLM_API_ENDPOINT", "https://example.invalid"); vi.stubEnv("LLM_API_KEY", "offline");
    let calls = 0;
    const client = { async evaluate(request: Parameters<TypesafeSystemOneClient["evaluate"]>[0]) {
      calls++;
      const choices = Object.keys(request.questions.move.criteria), choice = choices.includes("check") ? "check" : choices.includes("call") ? "call" : choices[0];
      return { answers: { move: { type: "choice", choice, confidence: 1, probabilities: Object.fromEntries(choices.map(k => [k, Number(k === choice)])) } } };
    } };
    const fetcher = async (_url: string, init: RequestInit) => {
      calls++; const body = JSON.parse(String(init.body)), choices = body.response_format.json_schema.schema.properties.action.enum;
      const action = choices.includes("check") ? "check" : choices.includes("call") ? "call" : choices[0];
      return Response.json({ choices: [{ message: { content: JSON.stringify({ action, sizing: null }) } }] });
    };
    try {
      const rows = await evaluatePilot(pilotBots(client, fetcher), adviceFixtures(5));
      save("benchmarks/results/opponent-advice-offline.json", { fixtureVersion, adviceVersion, rows, summary: summarizePilot(rows), providerOutputs: "scripted; no playing-strength evidence" });
      expect(rows).toHaveLength(960); expect(calls).toBe(960); expect(summarizePilot(rows).failures).toBe(0);
    } finally { vi.unstubAllEnvs(); }
  });
  it.skipIf(process.env.BOT_SCENARIO_LIVE !== "true")("runs the explicitly authorized capped paid pilot", async () => {
    verifyFreeze(manifest.files);
    const budget = preflight(), cap = budget.remaining, fixtures = adviceFixtures();
    const inputs = fixtures.map(f => ({ id: f.id, contexts: f.contexts }));
    const inputHash = createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
    const path = process.env.OPPONENT_ADVICE_REPORT ?? "benchmarks/results/opponent-advice-live.json";
    if (!/^benchmarks\/results\/[a-zA-Z0-9_-]+\.json$/.test(path) || existsSync(path) || existsSync(`${path}.started`)) throw new Error("Use a fresh benchmark report path");
    mkdirSync("benchmarks/results", { recursive: true }); writeFileSync(`${path}.started`, inputHash + "\n", { flag: "wx" });
    writeFileSync(`${path}.manifest.json`, JSON.stringify({ fixtureVersion, adviceVersion, files: manifest.files, inputHash, inputs, providers: { jev: "jev-latest", llm: model, reasoning: "low", playstyle: "balanced" }, cap }, null, 2));
    let rows: Awaited<ReturnType<typeof evaluatePilot>> = [];
    const report = () => ({ fixtureVersion, adviceVersion, inputHash, cap, attempts: cap - budget.remaining, rows, summary: summarizePilot(rows) });
    try { rows = await evaluatePilot(livePilotBots(new TypesafeSystemOneClient(), budget, () => save(path, report())), fixtures, partial => { rows = [...partial]; save(path, report()); }); }
    finally { save(path, report()); }
    expect(summarizePilot(rows).failures).toBe(0);
  }, 43_200_000);
});
