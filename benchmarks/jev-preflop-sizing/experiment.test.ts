import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { pokerEngineAdapter as engine, createDeterministicDeck } from "@/lib/poker/adapter";
import { allocation, combinations, cells, sizes, configuration, type Selection } from "./config";
import { classes, classify, responseClass, responseTables, conservative } from "./policies";
import { materialize, context, evaluate, rollout, conserve, type Row, type Outcome } from "./experiment";
import { mechanicalChecks, responseFixture } from "./mechanical";
import { verifyEvidence } from "./evidence";
import { interval, select, analyze } from "./analysis";
import { parse, save, acquire } from "./storage";
import { hash, verify } from "../preflop-action-value/integrity";
import { base } from "../preflop-candidate/fixtures";
const spec = allocation("development")[0];
const outcome: Outcome = { valueBB: 1.5, rootResponse: "fold:", flop: false, showdown: false, heroLaterChips: 0, opponentLaterChips: 0, actions: 2, terminalStacks: [202, 198], traceHash: "a".repeat(64) };
function synthetic(phase: "development" | "confirmation", benefit = 1): Row[] {
  return allocation(phase).map(spec => ({ spec, samples: 5000, deckHash: materialize(spec).deckHash, failure: null, failedArm: null,
    outcomes: Object.fromEntries(cells.map(c => [c.id, Object.fromEntries([200, ...sizes].map(root => [root, { ...outcome, valueBB: root === 200 ? 0 : benefit }]))])) }));
}
describe("Jev opening action-value v1 mechanics", () => {
  it("verifies historical model metadata, recorded inputs and total/incremental amounts", () => {
    const evidence = verifyEvidence();
    expect(evidence.observations).toHaveLength(18);
    expect(evidence.fixtures.map(f => [f.position, f.effectiveStackBB, f.rootTotalChips, f.incrementalChips])).toEqual([["button", 100, 200, 199], ["button", 100, 200, 199]]);
  });
  it("validates every expanded response/amount and all physical combinations and real hand numbers", async () => {
    expect(combinations).toEqual(["cd", "ch", "cs", "dh", "ds", "hs"]);
    expect(await mechanicalChecks()).toMatchObject({ fixtures: 48, engineValidatedResponses: 1352, passed: true });
    expect(allocation("development")).toHaveLength(192);
    expect(allocation("confirmation")).toHaveLength(480);
    expect(new Set([...allocation("development"), ...allocation("confirmation")].map(s => s.id)).size).toBe(672);
  });
  it("freezes unambiguous response priorities, AQ+/AJ+ and A2s connectors", () => {
    expect(classes).toHaveLength(169);
    expect(Object.keys(responseTables.selective)).toHaveLength(169);
    for (const c of ["AA", "KK", "QQ", "AKs", "AKo"]) expect(responseClass("selective", c, false)).toBe("raise");
    for (const c of ["77", "JJ", "AQo", "AQs", "AJs", "KQs"]) expect(responseClass("selective", c, false)).toBe("call");
    for (const c of ["AJo", "66", "KQo", "JTs"]) expect(responseClass("selective", c, false)).toBe("fold");
    for (const c of ["AA", "JJ", "AQo", "AQs", "AKo"]) expect(responseClass("loose", c, false)).toBe("raise");
    for (const c of ["22", "A2o", "K2s", "QJo", "JTo", "32s", "A2s"]) expect(responseClass("loose", c, false)).toBe("call");
    for (const c of ["K2o", "T8s", "T9o", "72o"]) expect(responseClass("loose", c, false)).toBe("fold");
    for (const c of ["88", "AJo", "AJs", "KQs"]) expect(responseClass("loose", c, true)).toBe("call");
    for (const c of ["77", "ATo", "KQo"]) expect(responseClass("loose", c, true)).toBe("fold");
    expect(classify(["Kh", "As"])).toBe("AKo");
  });
  it("uses contestable call odds, inclusive five-point margin and never raises", () => {
    const input = responseFixture("AQo", 6).input;
    const test = (equity: number) => conservative({ ...input, analysis: { ...input.analysis, contestablePotAfterCall: 20, showdownEquity: equity }, legalActions: [{ type: "call", amount: 4 }, { type: "fold" }, { type: "raise", minAmount: 10, maxAmount: 200 }] });
    expect(test(.24999)).toEqual({ type: "fold" });
    expect(test(.25)).toEqual({ type: "call", amount: 4 });
    expect(test(.25001)).toEqual({ type: "call", amount: 4 });
    expect(conservative({ ...input, legalActions: [{ type: "check" }, { type: "bet", minAmount: 2, maxAmount: 198 }] })).toEqual({ type: "check" });
  });
  it("overrides sampled equity with exact river guaranteed/impossible-call safeguards", () => {
    const input = responseFixture("AQo", 6).input;
    const river = { ...input, hand: { ...input.hand, street: "river" as const, communityCards: ["As", "Ks", "Qs", "Js", "Ts"] }, hero: { ...input.hero, holeCards: ["2c", "3d"] },
      analysis: { ...input.analysis, showdownEquity: 0, contestablePotAfterCall: 20 }, legalActions: [{ type: "call" as const, amount: 10 }, { type: "fold" as const }] };
    expect(conservative(river)).toEqual({ type: "call", amount: 10 });
    expect(conservative({ ...river, hand: { ...river.hand, communityCards: ["As", "Ah", "Ad", "Ac", "Ks"] }, analysis: { ...river.analysis, showdownEquity: 1 } })).toEqual({ type: "call", amount: 10 });
    const impossible = { ...river, hand: { ...river.hand, communityCards: ["3s", "3h", "3d", "3c", "2s"] }, hero: { ...river.hero, holeCards: ["2d", "2h"] }, analysis: { ...river.analysis, showdownEquity: 1 } };
    expect(conservative(impossible)).toEqual({ type: "fold" });
  });
  it("shares decks/streams across arms and hides opponents and future board from decisions", () => {
    const f = materialize(spec), other = materialize({ ...spec, id: spec.id + ":other" });
    expect(materialize(spec).deckHash).toBe(f.deckHash);
    expect(other.deckHash).not.toBe(f.deckHash);
    const v = engine.decisionView(f.state), heroSeat = v.currentActorSeat!;
    // Change every unknown card while holding visible state fixed, using only a new complete pre-hand deck.
    const unknown = f.deck.filter(c => !engine.heroCards(f.state, f.heroId).includes(c)).reverse();
    const hole = engine.heroCards(f.state, f.heroId);
    const prefix = [0, 1].flatMap(round => v.postflopOrder.map(seat => seat === heroSeat ? hole[round] : unknown.shift()!));
    const state = engine.startHand(base(2), createDeterministicDeck([...prefix, ...unknown]));
    expect(context(state, [], "shared", 8)).toEqual(context(f.state, [], "shared", 8));
    expect(context(state, [], "shared", 8).analysis.equitySamples).toBe(8);
    expect(context(f.state, [], "shared", 8).hero.holeCards).toEqual(hole);
  });
  it("completes shoves by engine call/fold, conserves chips and returns refunds/ties", async () => {
    for (const notation of ["AA", "72o"]) {
      const f = responseFixture(notation, 200);
      const fixture = { state: f.initial, heroId: f.heroId, deckHash: "test", deck: [] };
      const value = await rollout(fixture, spec, 200, "selective", "conservative", 8);
      expect(value.actions).toBe(2);
      expect(value.showdown).toBe(notation === "AA");
      expect(value.terminalStacks.reduce((a, b) => a + b)).toBe(400);
      if (notation === "72o") expect(value.valueBB).toBe(1.5);
    }
    // Royal board, disjoint hole/burn cards: a guaranteed split with full stacks refunded via awards.
    const waiting = base(2), v = engine.decisionView(engine.startHand(waiting, createDeterministicDeck()));
    const state = engine.startHand(waiting, createDeterministicDeck(["2c", "3d", "4c", "5d", "6c", "As", "Ks", "Qs", "7c", "Js", "8c", "Ts"]));
    let after = engine.applyAction(state, `p${v.currentActorSeat}`, { type: "raise", amount: 200 });
    after = engine.applyAction(after, engine.snapshot(after).currentActorId!, { type: "call", amount: 198 });
    conserve(after);
    expect(engine.snapshot(after).completionReason).toBe("showdown");
    expect(engine.decisionView(after).players.map(p => p.stack)).toEqual([200, 200]);
    expect((engine.decisionView(after).players.find(p => p.seat === v.currentActorSeat)!.stack - 199) / 2).toBe(.5);
  });
  it("invalidates whole blocks and retains a failure without replacement", async () => {
    const first = await evaluate(spec, {}, 8);
    expect(first.failure).toBeNull();
    expect(await evaluate(spec, {}, 8)).toEqual(first);
    const failed = await evaluate(spec, {}, 5000, async () => { throw new Error("Action limit exceeded"); });
    expect(failed.outcomes).toEqual({});expect(failed.failure).toBe("Action limit exceeded");
    expect(failed.failedArm).toBe("rules/rules/200");
  });
  it("selects on means, ties toward smaller sizes, requires every planned block and all six bounds", () => {
    const rows = synthetic("development");expect(select(rows)).toEqual({ AA: 4, KK: 4 });
    rows[0].failure = "failed";rows[0].outcomes = {};
    expect(select(rows)).toEqual({ KK: 4 });
    expect(select(synthetic("development", 0))).toEqual({});
    const negative = synthetic("development");for (const row of negative) row.outcomes["loose/conservative"][4].valueBB = -1;
    expect(select(negative)).toEqual({ AA: 5, KK: 5 });
    const selected: Selection = { AA: 4 };
    const confirmation = synthetic("confirmation").filter(r => r.spec.hand === "AA");
    const result = analyze(confirmation, "confirmation", selected, 100);
    expect(result[0].conclusion).toBe("shortlist-for-separate-Jev-plan");
    expect(result[0].comparisons.every(c => c.interval?.confidence === 1 - .05 / 12)).toBe(true);
    expect(result[1].conclusion).toBe("defer");
    expect(analyze(confirmation.slice(1), "confirmation", selected, 100)[0].conclusion).toBe("defer");
    expect(interval(confirmation, cells[0].id, 4, .95, 100)).toMatchObject({ meanBB: 1, lowerBB: 1, upperBB: 1, strataCounts: Array(24).fill(10) });
    expect(configuration.bootstrapResamples).toBe(20000);
  });
  it("deterministically validates/resumes checkpoints, rejects source/config drift and recovers stale locks", () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-sizing-")), path = join(dir, "block.gz"), digest = "c".repeat(64);
    try {
      const row = synthetic("development")[0];
      row.outcomes = Object.fromEntries(cells.map(c => [c.id, Object.fromEntries([200, ...sizes].map(root => [root, outcome]))]));
      save(path, digest, row, {});const before = readFileSync(path);
      save(path, digest, row, {});expect(readFileSync(path)).toEqual(before);
      expect(parse(before, digest, row.spec, {})).toEqual(row);
      expect(() => parse(before, "d".repeat(64), row.spec, {})).toThrow();
      expect(() => parse(before, digest, { ...row.spec, combo: 1 }, {})).toThrow();
      expect(() => parse(before, digest, row.spec, { AA: 4 })).toThrow();
      const bad = { ...row, outcomes: {} };
      expect(() => parse(gzipSync(JSON.stringify({ manifestHash: digest, selectionHash: hash("{}"), row: bad })), digest, row.spec, {})).toThrow();
      const source = join(dir, "source.ts");writeFileSync(source, "original");const files = { [source]: hash(readFileSync(source)) };verify(files);
      writeFileSync(source, "drift");expect(() => verify(files)).toThrow("Source freeze mismatch");
      const lock = join(dir, "lock");const release = acquire(lock);expect(() => acquire(lock, () => true)).toThrow("active");release();
      const prior = acquire(lock);const recovered = acquire(lock, () => false);prior();expect(() => acquire(lock, () => true)).toThrow("active");recovered();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("isolates workers from environment files, credentials and network APIs", () => {
    const script = `import './benchmarks/jev-preflop-sizing/isolation.mjs';
      for(const name of ['node:http','https','node:net','node:dns','node:child_process']){let blocked=false;try{await import(name);}catch{blocked=true;}if(!blocked)throw new Error(name);}
      let blocked=false;try{fetch('https://example.invalid');}catch{blocked=true;}if(!blocked)throw new Error('fetch');
      if(Object.keys(process.env).some(k=>/KEY|TOKEN|SECRET/.test(k)))throw new Error('credentials');console.log('isolated');`;
    expect(execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { NODE_ENV: "test", EXTERNAL_INFERENCE_ENABLED: "false" }, encoding: "utf8" }).trim()).toBe("isolated");
  });
});
