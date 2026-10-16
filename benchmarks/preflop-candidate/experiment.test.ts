import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";
import { emptyDiagnostics } from "@/lib/bots/types";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { createPokerAIState } from "@/lib/poker/ai-state";
import { createLegacySizingOptions } from "@/lib/typesafe/questions";
import { allocation, materialize, combinations, base, opening, projectStep } from "./fixtures";
import { override, eligible, CandidateBot, type Selection } from "./candidate";
import { context } from "../preflop-action-value/experiment";
import { evaluate, fixed, continuation, type BlockRow } from "./experiment";
import { interval, select, verdict } from "./analysis";
import { acquire, parseCheckpoint, saveCheckpoint } from "./storage";
const folded = { action: { type: "fold" as const }, diagnostics: emptyDiagnostics(), rawResponse: null };
const selection: Selection = { "medium-kk": "call", "hard-qq": "raise3" };
function positiveRows(phase: "screen" | "confirm") { return allocation(phase).map(spec => ({ spec, deckHash: "a".repeat(64), samples: 5000, baseline: { type: "fold" as const }, branch: null, treatment: true,
  values: Object.fromEntries(["frozen", "passive", "aggressive"].map(o => [o, { baseline: 0, call: 10, raise3: 10 }])), uniqueRollouts: 9, failure: null })); }
describe("focused preflop candidates", () => {
  it("allocates independent balanced development and holdout strata", () => {
    expect(allocation("screen")).toHaveLength(192); expect(allocation("confirm")).toHaveLength(480);
    expect(new Set([...allocation("screen"), ...allocation("confirm")].map(s => s.id)).size).toBe(672);
    for (const phase of ["screen", "confirm"] as const) for (const target of ["medium-kk", "hard-qq"]) {
      const rows = allocation(phase).filter(s => s.target === target);
      expect(new Set(rows.map(s => `${s.combo}:${s.handNumber}`)).size).toBe(24);
      for (const combo of combinations.keys()) for (const n of [1, 2, 7, 16]) expect(rows.filter(s => s.combo === combo && s.handNumber === n)).toHaveLength(phase === "screen" ? 4 : 10);
    }
  });
  it("advances real engine hands through neutral split pots without changing stacks", () => {
    for (const n of [1, 2, 7, 16]) for (const seats of [2, 6]) {
      const b = base(seats, 100, n);
      if (n > 1) expect(engine.decisionView(b).players.every(p => p.stack === 200)).toBe(true);
      const f = opening(["Kc", "Kd"], `number:${seats}:${n}`, { seats, handNumber: n });
      expect(engine.snapshot(f.state).handNumber).toBe(n);
      expect(context(f.state, [], "medium", 8).game.handNumber).toBe(n);
    }
  });
  it("conditions all physical combinations and keeps paired decks deterministic", () => {
    const hashes = new Set<string>();
    for (const combo of combinations.keys()) {
      const spec = { ...allocation("screen")[0], combo }, f = materialize(spec);
      expect(engine.heroCards(f.state, f.heroId)).toEqual(combinations[combo].map(s => "K" + s));
      expect(f).toEqual(materialize(spec)); hashes.add(f.deckHash);
    }
    expect(hashes.size).toBe(6);
    expect(materialize(allocation("screen")[0]).deckHash).not.toBe(materialize(allocation("confirm")[0]).deckHash);
  });
  it("only overrides the two measured baseline folds and preserves the exact baseline elsewhere", () => {
    const f = materialize(allocation("screen")[0]), c = context(f.state, [], "medium", 8);
    expect(eligible(c, folded)).toBe(true);
    expect(override(c, folded, { "medium-kk": "call" }).action).toEqual({ type: "call", amount: 2 });
    expect(override(c, folded, { "medium-kk": "raise3" }).action).toEqual({ type: "raise", amount: 6 });
    const calls = { ...folded, action: { type: "call" as const, amount: 2 } };
    expect(override(c, calls, selection)).toBe(calls);
    expect(override({ ...c, difficulty: "hard" }, folded, selection)).toBe(folded);
    expect(override({ ...c, situation: { ...c.situation!, historyStatus: "unknown" } }, folded, selection)).toBe(folded);
    expect(override({ ...c, hero: { ...c.hero, stack: 199 } }, folded, selection)).toBe(folded);
    expect(override({ ...c, opponents: c.opponents.map((o, i) => i === 0 ? { ...o, stack: o.stack - 1 } : o) }, folded, selection)).toBe(folded);
    expect(() => override({ ...c, legalActions: c.legalActions.filter(a => a.type !== "raise") }, folded, { "medium-kk": "raise3" })).toThrow("legal action missing");
  });
  it("uses production context including actual hand number and keeps hidden holdings out", async () => {
    const spec = { ...allocation("screen")[0], handNumber: 7 }, f = materialize(spec), c = context(f.state, [], "medium", 5000);
    const ai = createPokerAIState(f.state, f.heroId, { difficulty: "medium", correctedContext: false, equitySamples: 5000, historyStatus: "complete", decisionHistory: [] });
    expect(c).toEqual({ ...ai, sizingOptions: createLegacySizingOptions(ai) });
    const other = opening(["Kc", "Kd"], "different-hidden-cards", { handNumber: 7 });
    expect(context(other.state, [], "medium", 5000)).toEqual(c);
    expect(c.opponents.every(o => !("holeCards" in o))).toBe(true);
    const bot = new CandidateBot(selection), baseline = await new EquityRulesV2Bot().decide(c);
    expect(await bot.decide(c)).toEqual(override(c, baseline, selection));
  }, 30000);
  it("checks full hand/position/stack and protected-history matrices", async () => {
    const result = await fixed(8);
    expect(result.passed).toBe(true); expect(result.rows.filter(r => r.id.startsWith("class:")).length).toBe(169 * 3);
    for (const prefix of ["unknown:", "unequal:", "pressure:", "postflop:"]) {
      const rows = result.rows.filter(r => r.id.startsWith(prefix));expect(rows.length).toBeGreaterThan(0);expect(rows.every(r => !r.overrides.length)).toBe(true);
    }
    expect(result.rows.some(r => r.overrides.length > 0)).toBe(true);
  }, 120000);
  it("projects actual numbered current-hand transitions", () => {
    const f = materialize({ ...allocation("screen")[0], handNumber: 16 });
    const after = engine.applyAction(f.state, f.heroId, { type: "call", amount: 2 });
    const h = projectStep(f.state, after, { type: "call", amount: 2 }, 1);
    const c = context(after, [h], "medium", 8);
    expect(c.game.handNumber).toBe(16);expect(c.actionHistory).toHaveLength(1);
    expect(override(c, folded, selection)).toBe(folded);
  });
  it("deduplicates first actions and excludes all controls after one failed rollout", async () => {
    let calls = 0;
    const fake: typeof continuation = async () => { calls++; if (calls === 2) throw new Error("Action limit exceeded"); return 0; };
    const result = await evaluate(allocation("screen")[0], {}, 8, fake);
    expect(result.failure).toBe("action_limit");expect(result.values).toEqual({});expect(calls).toBe(2);
    const honest = await evaluate(allocation("screen")[0], {}, 8);
    expect(honest.failure).toBeNull();expect(honest.uniqueRollouts).toBe(3);
    expect(Object.values(honest.values).every(v => v.baseline === v.call && v.call === v.raise3)).toBe(true);
  });
  it("selects by the worst control lower bound and keeps call on exact ties", () => {
    const rows = positiveRows("screen");
    expect(select(rows, true, 100)).toEqual({ "medium-kk": "call", "hard-qq": "call" });
    expect(select(rows, false, 100)).toEqual({});
    const poor = rows.map(r => ({ ...r, values: { ...r.values, frozen: { baseline: 0, call: -1, raise3: -1 } } }));
    expect(select(poor, true, 100)).toEqual({});
    const mixed = rows.map(r => ({ ...r, values: { frozen: { baseline: 0, call: 2, raise3: 5 }, passive: { baseline: 0, call: 100, raise3: 3 }, aggressive: { baseline: 0, call: 100, raise3: 10 } } }));
    expect(select(mixed, true, 100)).toEqual({ "medium-kk": "raise3", "hard-qq": "raise3" });
    const excluded = rows.map((r, i) => i === 0 ? { ...r, failure: "rollout_failed", values: {} } : r);
    expect(select(excluded, true, 100)["medium-kk"]).toBeUndefined();
  });
  it("uses balanced stratified intervals, adjusted holdout confidence, and no replacement selection", () => {
    const rows = positiveRows("confirm");
    const i = interval(rows.filter(r => r.spec.target === "medium-kk"), "frozen", "call", 1 - .05 / 6, 100)!;
    expect(i.meanBB).toBe(10);expect(i.strataCounts).toEqual(Array(24).fill(10));expect(i.confidence).toBe(1 - .05 / 6);
    expect(verdict(rows, selection, true, 100)).toEqual({ "medium-kk": "confirmed-conditional-value", "hard-qq": "confirmed-conditional-value" });
    const failedHoldout = rows.map(r => r.spec.target === "medium-kk" ? { ...r, values: { frozen: { baseline: 0, call: -2, raise3: 100 }, passive: { baseline: 0, call: -2, raise3: 100 }, aggressive: { baseline: 0, call: -2, raise3: 100 } } } : r);
    expect(verdict(failedHoldout, selection, true, 100)["medium-kk"]).toBe("defer");
    expect(verdict([], {}, true, 100)).toEqual({ "medium-kk": "defer", "hard-qq": "defer" });
    expect(interval(rows.filter(r => r.spec.combo === 0), "frozen", "call", .95, 100)).toBeNull();
  });
  it("validates immutable checkpoints and blocks concurrent coordinators", () => {
    const dir = mkdtempSync(join(tmpdir(), "preflop-candidate-"));
    try {
      const path = join(dir, "checkpoint.gz"), row: BlockRow = positiveRows("screen")[0];
      saveCheckpoint(path, "manifest", row, {});expect(parseCheckpoint(readFileSync(path), "manifest", row.spec, {})).toEqual(row);
      expect(() => parseCheckpoint(readFileSync(path), "changed", row.spec, {})).toThrow("mismatch");
      expect(() => parseCheckpoint(gzipSync(JSON.stringify({ manifestHash: "manifest", row: { ...row, samples: 100 } })), "manifest", row.spec, {})).toThrow();
      expect(() => saveCheckpoint(path, "manifest", { ...row, deckHash: "b".repeat(64) }, {})).toThrow("already differs");
      const lock = join(dir, "coordinator.lock"), release = acquire(lock);
      expect(() => acquire(lock)).toThrow("active");release();
      writeFileSync(lock, JSON.stringify({ pid: 12345, token: "stale", host: hostname() }));const recovered = acquire(lock, () => false);recovered();
      writeFileSync(lock, JSON.stringify({ pid: 12345, token: "unknown", host: hostname() }));expect(() => acquire(lock, () => { throw new Error("Cannot verify"); })).toThrow("Cannot verify");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("isolates smoke workers from parent provider credentials and opt-ins", () => {
    const output = execFileSync(process.execPath, ["benchmarks/preflop-candidate/run.mjs", "smoke"], { encoding: "utf8", env: { ...process.env, TYPESAFE_API_KEY: "candidate-test-sentinel", EXTERNAL_INFERENCE_ENABLED: "true" } });
    expect(JSON.parse(output).completed).toBe(true);expect(output).not.toContain("candidate-test-sentinel");
  });
});
