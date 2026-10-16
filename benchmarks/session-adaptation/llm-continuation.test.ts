import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { blocks, design } from "./session";
import { digest, fileHash, prepareContinuation } from "./continuation";
import { combinedLlm, llmSchedule, prepareLlm, validateLlm } from "./llm-continuation";
import { Ledger, type Evidence } from "./storage";
import { authorize } from "./live";
import { report } from "./report";
function fixture(dir: string) {
  const source = join(dir, "policy.ts"); writeFileSync(source, "frozen policy");
  const body = { design, blocks, files: { [source]: fileHash(source) } }, freeze = { ...body, manifestHash: digest(body) };
  const parent: Evidence = { version: design.version, manifestHash: freeze.manifestHash, status: "stopped", failure: "provider_failure", failures: [], requests: Array.from({ length: 889 }, (_, index) => ({ block: blocks[index < 600 ? 0 : 1].id, episode: "original-memory", hand: 1, index, status: index === 888 ? "reserved" : "completed" })), blocks: blocks.map((b, i) => ({ ...b, status: i === 0 ? "budget" : i === 1 ? "failed" : "pending" })), hands: [], decisions: [] };
  const originalPath = join(dir, "original.json"), freezePath = join(dir, "freeze.json"); writeFileSync(originalPath, JSON.stringify(parent)); writeFileSync(freezePath, JSON.stringify(freeze));
  const previousManifest = prepareContinuation(originalPath, freezePath, { [source]: fileHash(source) });
  const previous = new Ledger(join(dir, "previous.json"), previousManifest.scheduled, previousManifest.manifestHash, previousManifest.limits).evidence;
  previous.status = "stopped"; previous.failure = "provider_failure";
  previous.blocks[0].status = "budget"; previous.blocks[1].status = "failed";
  previous.requests = Array.from({ length: 668 }, (_, index) => ({ block: blocks[index < 600 ? 2 : 3].id, episode: "previous-memory", hand: 1, index, status: index === 667 ? "reserved" : "completed" }));
  const previousPath = join(dir, "previous.json"), previousFreeze = join(dir, "previous-freeze.json"); writeFileSync(previousPath, JSON.stringify(previous)); writeFileSync(previousFreeze, JSON.stringify(previousManifest));
  const manifest = prepareLlm(previousPath, previousFreeze, { [source]: fileHash(source) });
  return { source, originalPath, previousPath, previousFreeze, manifest };
}
function temporary(test: (dir: string) => void) { const dir = mkdtempSync(join(tmpdir(), "session-llm-")); try { test(dir); } finally { rmSync(dir, { recursive: true, force: true }); } }
describe("explicit LLM-only quota amendment", () => {
  it("freezes only two untouched LLM blocks, skips untouched Jev and caps combined reservations", () => temporary(dir => {
    const f = fixture(dir), parent = validateLlm(f.manifest);
    expect(f.manifest.scheduled).toEqual([blocks[5], blocks[7]]); expect(f.manifest.skipped).toEqual([blocks[4], blocks[6]]); expect(f.manifest.limits).toEqual({ requestCap: 1200, priorRequests: 1557, combinedCap: 2757 });
    const bytes = readFileSync(f.previousPath, "utf8"), child = new Ledger(join(dir, "llm.json"), f.manifest.scheduled, f.manifest.manifestHash, f.manifest.limits).evidence;
    const merged = combinedLlm(parent, child, f.manifest), result = report(merged);
    expect(result.requests).toBe(1557); expect(result.requestMaximum).toBe(2757); expect(result.blocks.filter(b => b.status === "skipped").map(b => b.id)).toEqual([blocks[4].id, blocks[6].id]); expect(result.blocks.slice(0, 4).every(b => b.differenceBB100 === null)).toBe(true); expect(merged.requests.filter(r => r.status === "reserved")).toHaveLength(2); expect(readFileSync(f.previousPath, "utf8")).toBe(bytes);
  }));
  it("rejects partial LLM replay, changed source, original evidence or schedule", () => temporary(dir => {
    const f = fixture(dir), parent = validateLlm(f.manifest);
    parent.hands.push({ block: blocks[5].id, episode: "contaminated", hand: 1, seat: 0, memory: true, profitBB: 0 }); expect(() => llmSchedule(parent)).toThrow("observations");
    writeFileSync(f.source, "changed policy"); expect(() => prepareLlm(f.previousPath, f.previousFreeze, {})).toThrow("policy/source changed");
    writeFileSync(f.previousPath, readFileSync(f.previousPath, "utf8") + "\n"); expect(() => validateLlm(f.manifest)).toThrow("evidence changed");
  }));
  it("forbids any Jev dispatch, replay or second startup", () => temporary(dir => {
    const f = fixture(dir), parent = validateLlm(f.manifest), path = join(dir, "llm.json"), ledger = new Ledger(path, f.manifest.scheduled, f.manifest.manifestHash, f.manifest.limits);
    expect(() => ledger.reserve(blocks[4].id, "jev", 1, 0)).toThrow("Unscheduled"); expect(() => new Ledger(path, f.manifest.scheduled, f.manifest.manifestHash, f.manifest.limits)).toThrow();
    ledger.evidence.requests.push({ block: blocks[1].id, episode: "replayed", hand: 1, index: 0, status: "completed" }); expect(() => combinedLlm(parent, ledger.evidence, f.manifest)).toThrow("replayed");
  }));
  it("needs only the LLM credential and a dedicated authorization", () => {
    const env = { SESSION_ADAPTATION_AUTHORIZATION: "authorize-session-adaptation-llm-only-1200", BOT_SCENARIO_LIVE: "true", EXTERNAL_INFERENCE_ENABLED: "true", BOT_DECISION_CALL_CAP: "5000", LLM_API_KEY: "scripted-local", LLM_API_ENDPOINT: "https://openrouter.ai/api/v1/chat/completions" };
    expect(() => authorize(env, "authorize-session-adaptation-llm-only-1200", ["llm"])).not.toThrow(); expect(() => authorize(env, "authorize-session-adaptation-remaining-six-3600", ["llm"])).toThrow();
  });
  it("starts real Node LLM branch and combined report without inference or credentials in reporting", () => temporary(dir => {
    const f = fixture(dir), directory = join(dir, "benchmarks/session-adaptation"); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "live-ledger.json"), readFileSync(f.originalPath)); writeFileSync(join(directory, "llm-freeze.json"), JSON.stringify(f.manifest));
    new Ledger(join(directory, "llm-ledger.json"), f.manifest.scheduled, f.manifest.manifestHash, f.manifest.limits);
    const runner = new URL("./run.mjs", import.meta.url), env = { PATH: process.env.PATH, NODE_ENV: "test" as const };
    execFileSync(process.execPath, [runner.pathname, "report"], { cwd: dir, env }); const result = JSON.parse(readFileSync(join(dir, "benchmarks/results/session-adaptation-report.json"), "utf8")); expect(result.requests).toBe(1557); expect(result.protocolAmendment.skippedJevBlocks).toHaveLength(2);
    const script = `globalThis.fetch = () => { throw new Error('Network forbidden'); }; process.argv[2] = 'llm-live'; try { await import(${JSON.stringify(runner.href)}); throw new Error('Replay'); } catch(error) { if(error.code !== 'EEXIST') throw error; console.log('Exclusive LLM ledger guard; no inference'); }`;
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: dir, encoding: "utf8", env: { ...env, SESSION_ADAPTATION_AUTHORIZATION: "authorize-session-adaptation-llm-only-1200", BOT_SCENARIO_LIVE: "true", EXTERNAL_INFERENCE_ENABLED: "true", BOT_DECISION_CALL_CAP: "5000", LLM_API_KEY: "scripted-local", LLM_API_ENDPOINT: "https://openrouter.ai/api/v1/chat/completions" } }); expect(output).toContain("Exclusive LLM ledger guard; no inference");
  }));
});
