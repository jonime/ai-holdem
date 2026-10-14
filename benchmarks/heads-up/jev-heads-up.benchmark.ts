import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync } from "node:fs";
import { JevPokerBot } from "@/lib/bots/jev";
import { getTypesafeServerEnv } from "@/lib/env/server";
import { TypesafeSystemOneClient } from "@/lib/typesafe/client";
import { memoryFixtures, evaluateMemory, summarizeMemory, memoryFixtureVersion } from "./memory";
import { RequestBudget, verifyFreeze, experimentVersion } from "./experiment";
import manifest from "../evidence/jev-hu-freeze-2026-10-14.json";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const evidence = "benchmarks/evidence/jev-hu-memory-live-2026-10-14.json";
function save(path: string, value: unknown) {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + "\n"); renameSync(`${path}.tmp`, path);
}
describe("Jev explicit heads-up evaluation", () => {
  it("verifies frozen policy and offline memory mechanics", async () => {
    verifyFreeze(manifest.files);
    const fixtures = memoryFixtures(5);
    const bot = { async decide(context: Parameters<JevPokerBot["decide"]>[0]) {
      const passive = context.legalActions.find(a => a.type === "call" || a.type === "check")!;
      return { action: passive, rawResponse: null, diagnostics: { probabilities: null, confidence: null, sizing: null, matchedRule: null,
        promptVersion: "offline-mechanics", botProfileId: null, durationMs: null, usage: null, cost: null } };
    } };
    const rows = await evaluateMemory(bot, fixtures);
    expect(rows).toHaveLength(108); expect(rows.every(r => !r.failure)).toBe(true);
    mkdirSync("benchmarks/results", { recursive: true });
    save("benchmarks/results/jev-hu-offline.json", { kind: "offline-mechanics-only", notPlayingStrength: true, rows, summaries: summarizeMemory(rows) });
  });
  it.skipIf(process.env.BOT_SCENARIO_LIVE !== "true")("runs the frozen capped live memory experiment once", async () => {
    if (process.env.EXTERNAL_INFERENCE_ENABLED !== "true") throw new Error("Explicit inference opt-in required");
    const cap = Number(process.env.BOT_DECISION_CALL_CAP);
    if (cap !== 108) throw new Error("Rejected source: this run permits only the 108-call memory allocation");
    verifyFreeze(manifest.files);
    getTypesafeServerEnv(); // Fail before reserving anything when credentials are absent.
    if (existsSync(evidence)) throw new Error("This fresh allocation already has an evidence ledger; no repeat requests authorized by this runner");
    // Exclusive persistent start marker refuses a rerun even after crash, before any request.
    closeSync(openSync(`${evidence}.started`, "wx"));
    const fixtures = memoryFixtures();
    const inputs = fixtures.map(f => ({ id: f.id, contexts: f.contexts }));
    let rows: Awaited<ReturnType<typeof evaluateMemory>> = [];
    let status = "running";
    const report = () => ({ version: experimentVersion, date: "2026-10-14", fixtureVersion: memoryFixtureVersion,
      priorCredentialFailureLedger: "jev-hu-memory-2026-10-14.json", sourceAudit: "jev-hu-source-audit-2026-10-14.json", chartSourceAccepted: false, chartDependentCalls: 0,
      authorizedCeiling: 1000, allocatedCap: 108, usedRequests: budget.used, allocations: budget.allocations,
      inputChecksum: digest(JSON.stringify(inputs)), frozenFiles: manifest.files, status, rows, summaries: summarizeMemory(rows),
      qualityGrade: null, limitation: "Three repetitions measure behavioral sensitivity; no independently supported quality reference and no match-strength evidence." });
    const budget = new RequestBudget(cap, () => save(evidence, report())); // Persist reservation BEFORE network.
    save(evidence, report());
    const bot = new JevPokerBot(budget.client(new TypesafeSystemOneClient(), "memory"));
    try {
      rows = await evaluateMemory(bot, fixtures, partial => { rows = [...partial]; save(evidence, report()); });
      status = "complete";
      expect(budget.used).toBe(108);
    } finally {
      save(evidence, report());
      save(`${evidence}.manifest.json`, { sha256: digest(readFileSync(evidence, "utf8")), usedRequests: budget.used,
        complete: status === "complete", sourceManifestSha256: digest(readFileSync("benchmarks/evidence/jev-hu-source-audit-2026-10-14.json", "utf8")) });
    }
  }, 3_600_000);
});
