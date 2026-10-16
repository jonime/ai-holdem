import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blocks, design } from "./session";
import { combined, digest, eligible, fileHash, prepareContinuation, validateContinuation } from "./continuation";
import { Ledger, type Evidence } from "./storage";
import { authorize } from "./live";
import { report } from "./report";
function fixture(dir: string) {
  const source = join(dir, "policy.ts"); writeFileSync(source, "frozen policy");
  const freezeBody = { design, blocks, files: { [source]: fileHash(source) } };
  const freeze = { ...freezeBody, manifestHash: digest(freezeBody) };
  const parent: Evidence = { version: design.version, manifestHash: freeze.manifestHash, status: "stopped", failure: "provider_parse_engine_or_invariant_failure", failures: [{ block: blocks[1].id, episode: "stopped", hand: 34, category: "timeout" }], requests: Array.from({ length: 889 }, (_, index) => ({ block: blocks[index < 600 ? 0 : 1].id, episode: index < 600 ? "budget-memory" : "stopped-memory", hand: Math.floor(index / 20) + 1, index, status: index === 888 ? "reserved" : "completed" })), blocks: blocks.map((b, i) => ({ ...b, status: i === 0 ? "budget" : i === 1 ? "failed" : "pending" })), decisions: [], hands: [] };
  const parentPath = join(dir, "parent.json"), freezePath = join(dir, "freeze.json");
  writeFileSync(parentPath, JSON.stringify(parent)); writeFileSync(freezePath, JSON.stringify(freeze));
  const manifest = prepareContinuation(parentPath, freezePath, { [source]: fileHash(source) });
  return { source, parent, parentPath, freezePath, manifest };
}
function temporary(test: (dir: string) => void) { const dir = mkdtempSync(join(tmpdir(), "session-continuation-")); try { test(dir); } finally { rmSync(dir, { recursive: true, force: true }); } }
describe("explicit session continuation amendment", () => {
  it("selects exactly the six untouched blocks in original order and preserves original bytes", () => temporary(dir => {
    const f = fixture(dir), bytes = readFileSync(f.parentPath, "utf8");
    expect(f.manifest.scheduled).toEqual(blocks.slice(2)); expect(f.manifest.limits).toEqual({ requestCap: 3600, priorRequests: 889, combinedCap: 4489 });
    expect(validateContinuation(f.manifest)).toEqual(f.parent); expect(readFileSync(f.parentPath, "utf8")).toBe(bytes);
  }));
  it("starts combined report and continuation entry points without network or replay", () => temporary(dir => {
    const { parentPath, manifest } = fixture(dir), original = readFileSync(parentPath, "utf8");
    const directory = join(dir, "benchmarks/session-adaptation"); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "live-ledger.json"), original);
    writeFileSync(join(directory, "continuation-freeze.json"), JSON.stringify(manifest));
    new Ledger(join(directory, "continuation-ledger.json"), manifest.scheduled, manifest.manifestHash, manifest.limits);
    const runner = new URL("./run.mjs", import.meta.url).href;
    const env = { PATH: process.env.PATH, NODE_ENV: "test" as const };
    execFileSync(process.execPath, [new URL(runner).pathname, "report"], { cwd: dir, env });
    const result = JSON.parse(readFileSync(join(dir, "benchmarks/results/session-adaptation-report.json"), "utf8"));
    expect(result.requests).toBe(889); expect(result.requestMaximum).toBe(4489); expect(result.protocolAmendment.originalIncompleteBlocksExcluded).toBe(true);
    const script = `globalThis.fetch = () => { throw new Error('Network forbidden'); }; process.argv[2] = 'continue-live'; try { await import(${JSON.stringify(runner)}); throw new Error('Unexpected replay'); } catch (error) { if (error.code !== 'EEXIST') throw error; console.log('Continuation reached exclusive ledger guard; no inference'); }`;
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: dir, encoding: "utf8", env: { ...env, SESSION_ADAPTATION_AUTHORIZATION: "authorize-session-adaptation-remaining-six-3600", BOT_SCENARIO_LIVE: "true", EXTERNAL_INFERENCE_ENABLED: "true", BOT_DECISION_CALL_CAP: "5000", TYPESAFE_API_KEY: "scripted-local", LLM_API_KEY: "scripted-local", LLM_API_ENDPOINT: "https://openrouter.ai/api/v1/chat/completions" } });
    expect(output).toContain("exclusive ledger guard; no inference"); expect(readFileSync(parentPath, "utf8")).toBe(original);
  }));
  it("rejects any observation in a supposedly untouched block, changed schedule or nonstopped run", () => temporary(dir => {
    const { parent } = fixture(dir);
    const contaminated = structuredClone(parent); contaminated.hands.push({ block: blocks[2].id, episode: "contaminated", hand: 1, memory: true, seat: 0, profitBB: 0 }); expect(() => eligible(contaminated)).toThrow("prior evidence");
    const changed = structuredClone(parent); changed.blocks[2].seed++; expect(() => eligible(changed)).toThrow("schedule");
    parent.status = "running"; expect(() => eligible(parent)).toThrow("stopped");
  }));
  it("rejects changed original policy, ledger bytes, freeze bytes and amendment limits", () => temporary(dir => {
    const f = fixture(dir);
    writeFileSync(f.source, "different policy"); expect(() => prepareContinuation(f.parentPath, f.freezePath, {})).toThrow("policy/source changed");
    writeFileSync(f.source, "frozen policy");
    writeFileSync(f.parentPath, readFileSync(f.parentPath, "utf8") + "\n"); expect(() => validateContinuation(f.manifest)).toThrow("evidence changed");
    const altered = { ...f.manifest, limits: { requestCap: 3601, priorRequests: 889, combinedCap: 4490 } }; expect(() => validateContinuation(altered)).toThrow();
  }));
  it("does not reuse the original authorization", () => {
    const env = { SESSION_ADAPTATION_AUTHORIZATION: "authorize-new-session-adaptation-4800", BOT_SCENARIO_LIVE: "true", EXTERNAL_INFERENCE_ENABLED: "true", BOT_DECISION_CALL_CAP: "5000", TYPESAFE_API_KEY: "local-real", LLM_API_KEY: "local-real", LLM_API_ENDPOINT: "https://openrouter.ai/api/v1/chat/completions" };
    expect(() => authorize(env, "authorize-session-adaptation-remaining-six-3600")).toThrow();
    expect(() => authorize({ ...env, SESSION_ADAPTATION_AUTHORIZATION: "authorize-session-adaptation-remaining-six-3600" }, "authorize-session-adaptation-remaining-six-3600")).not.toThrow();
  });
  it("enforces a new exclusive ledger, allowed blocks, duplicate-decision guards and combined cap", () => temporary(dir => {
    const { manifest } = fixture(dir); const path = join(dir, "child.json"); const ledger = new Ledger(path, manifest.scheduled, manifest.manifestHash, manifest.limits);
    expect(() => ledger.reserve(blocks[0].id, "excluded", 1, 0)).toThrow("Unscheduled");
    const index = ledger.reserve(blocks[2].id, "new", 1, 0); ledger.complete(index);
    expect(() => ledger.reserve(blocks[2].id, "new", 1, 0)).toThrow("duplicate");
    expect(() => new Ledger(path, manifest.scheduled, manifest.manifestHash, manifest.limits)).toThrow();
    ledger.evidence.requests = manifest.scheduled.flatMap(b => Array.from({ length: 600 }, (_, index) => ({ block: b.id, episode: b.id, hand: 1, index, status: "completed" as const })));
    expect(() => ledger.reserve(blocks[2].id, "new", 2, 0)).toThrow();
    expect(() => new Ledger(join(dir, "bad.json"), manifest.scheduled, "bad", { requestCap: 3600, priorRequests: 890, combinedCap: 4489 })).toThrow("limits");
  }));
  it("merges reports without hiding original timeout, unresolved reservation or exclusions", () => temporary(dir => {
    const { parent, manifest } = fixture(dir); const child = new Ledger(join(dir, "child.json"), manifest.scheduled, manifest.manifestHash, manifest.limits).evidence;
    child.status = "complete";
    const merged = combined(parent, child, manifest), result = report(merged);
    expect(result.requests).toBe(889); expect(result.requestMaximum).toBe(4489); expect(result.blocks[0].differenceBB100).toBeNull(); expect(result.blocks[1].differenceBB100).toBeNull(); expect(result.blocks[1].unresolvedReservations).toBe(1); expect(merged.failures).toEqual(parent.failures); expect(parent.blocks[2].status).toBe("pending");
    child.requests.push({ block: blocks[0].id, episode: "replay", hand: 1, index: 0, status: "reserved" }); expect(() => combined(parent, child, manifest)).toThrow("Out-of-schedule");
  }));
});
