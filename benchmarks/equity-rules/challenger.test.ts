import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";
import { createPokerAIState } from "@/lib/poker/ai-state";
import { createLegacySizingOptions } from "@/lib/typesafe/questions";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { projectBotHistory, legacyDecisionHistory } from "@/lib/poker/bot-history";
import { analyzePokerDecision } from "@/lib/poker/decision-facts";
import { scenarios } from "../scenarios/harness";
import { ExperimentalRulesBot, structuredDecision, variants } from "./challenger";
import { rulesContext } from "./context";
import { replayScenario, fixedCoverage, rangeSensitivity } from "./coverage";
import { bootstrapInterval, compare, difficulties, playHand } from "./experiment";

const fixture = (id: string) => replayScenario(scenarios.find(s => s.id === id)!);
const context = (id: string) => { const f = fixture(id); return rulesContext(f.state, f.history, "structured", "medium", 100); };
describe("frozen rules baseline and context boundary", () => {
  it("matches production policy and relevant context on every existing fixture", async () => {
    for (const scenario of scenarios) for (const difficulty of difficulties) {
      const f = replayScenario(scenario), actor = engine.snapshot(f.state).currentActorId!;
      const projected = projectBotHistory(f.history, f.state, actor);
      const ai = createPokerAIState(f.state, actor, { difficulty, equitySamples: 100,
        decisionHistory: legacyDecisionHistory(projected.actions), historyStatus: projected.status });
      const production = { ...ai, sizingOptions: createLegacySizingOptions(ai) };
      const frozen = rulesContext(f.state, f.history, "frozen", difficulty, 100);
      expect(frozen).toEqual(production);
      expect((await new ExperimentalRulesBot("frozen").decide(frozen)).action).toEqual((await new EquityRulesV2Bot().decide(production)).action);
      const facts = rulesContext(f.state, f.history, "facts", difficulty, 100);
      expect(facts.analysis.showdownEquity).toBe(frozen.analysis.showdownEquity);
      expect(facts.actionHistory).toEqual(frozen.actionHistory);
    }
  }, 30_000);
  it("uses frozen context and policy when authoritative history is unknown", async () => {
    const f = fixture("flop-draw-facing-bet");
    const frozen = rulesContext(f.state, null, "frozen", "hard", 100);
    for (const variant of ["facts", "structured"] as const) {
      const ctx = rulesContext(f.state, null, variant, "hard", 100);
      expect(ctx).toEqual(frozen);
      const decision = await new ExperimentalRulesBot(variant).decide(ctx);
      expect(decision.action).toEqual((await new ExperimentalRulesBot("frozen").decide(frozen)).action);
      expect(decision.diagnostics.matchedRule).toMatch(/^fallback:/);
    }
  });
  it("pins copied baseline source checksums", () => {
    const manifest = JSON.parse(readFileSync("benchmarks/equity-rules/freeze-v1.json", "utf8")) as { sha256: Record<string, string> };
    for (const [path, hash] of Object.entries(manifest.sha256))
      expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(hash);
  });
});
describe("structured decision stages", () => {
  it("requires hero improvement and each difficulty's value threshold", () => {
    const base = context("flop-made-facing-bet");
    for (const difficulty of difficulties) {
      const valueThreshold = { easy: .7, medium: .62, hard: .56 }[difficulty];
      const low = structuredDecision({ ...base, difficulty }, valueThreshold - .01);
      expect(low.diagnostics.matchedRule).not.toMatch(/:value$/);
      expect(structuredDecision({ ...base, difficulty }, .9).diagnostics.matchedRule).toBe("structured:value");
    }
    const river = context("royal-board-facing-small-bet");
    expect(structuredDecision(river, .95).diagnostics.matchedRule).not.toBe("structured:river-value");
  });
  it("semi-bluffs genuine hero draws only on flop/turn against one fold-capable opponent", () => {
    const base = context("flop-draw-facing-bet");
    expect(analyzePokerDecision(base).draws.flushDrawUsesHoleCards).toBe(true);
    const frequencies = Array.from({ length: 100 }, (_, i) => ({ ...base, game: { ...base.game, handNumber: i + 1 } }));
    const chosen = frequencies.find(ctx => structuredDecision(ctx, .4).diagnostics.matchedRule === "structured:semi-bluff")!;
    expect(chosen).toBeDefined();
    const rejects = [
      { ...chosen, difficulty: "easy" as const },
      { ...chosen, opponents: [...chosen.opponents, { ...chosen.opponents[0], seat: 2 }] },
      { ...chosen, opponents: chosen.opponents.map(o => ({ ...o, status: "all_in" as const, stack: 0 })) },
      { ...chosen, hero: { ...chosen.hero, holeCards: ["Js", "Tc"] } },
      { ...chosen, hand: { ...chosen.hand, street: "preflop" as const, communityCards: [] } },
    ];
    for (const ctx of rejects) expect(structuredDecision(ctx, .4).diagnostics.matchedRule).not.toBe("structured:semi-bluff");
    expect(structuredDecision(chosen, .4)).toEqual(structuredDecision(chosen, .4));
    const backdoor = { ...chosen, hand: { ...chosen.hand, communityCards: ["9h", "4c", "2s"] } };
    expect(structuredDecision(backdoor, .4).diagnostics.matchedRule).not.toBe("structured:semi-bluff");
  });
  it("preserves river safeguards, short calls and legal non-reopening actions", async () => {
    for (const scenario of scenarios) for (const difficulty of difficulties) {
      const f = replayScenario(scenario), ctx = rulesContext(f.state, f.history, "structured", difficulty, 100);
      const action = (await new ExperimentalRulesBot("structured").decide(ctx)).action;
      expect(() => engine.applyAction(f.state, engine.snapshot(f.state).currentActorId!, action)).not.toThrow();
      expect(scenario.forbidden).not.toContain(action.type);
    }
    const ctx = context("turn-short-unmatched");
    expect(structuredDecision(ctx, 1).action).toEqual({ type: "call", amount: 6 });
  });
  it("never invents a raise after a short all-in fails to reopen betting", async () => {
    let state = engine.startHand(engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: 3,
      players: [200, 200, 7].map((stack, seat) => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, stack, controller: "bot" })) }));
    const initialState = state;
    const actions: import("@/lib/poker/bot-history").BotHandContext["actions"][number][] = [];
    for (const action of [{ type: "raise", amount: 6 }, { type: "call", amount: 5 }, { type: "raise", amount: 7 }] as const) {
      const before = state; state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
      actions.push({ sequence: actions.length + 1, action, stateBefore: before });
    }
    for (const variant of variants) {
      const ctx = rulesContext(state, { version: 0, handNumber: 1, initialState, actions }, variant, "hard", 10);
      expect(ctx.legalActions.map(a => a.type)).not.toContain("raise");
      const decision = await new ExperimentalRulesBot(variant).decide(ctx);
      expect(() => engine.applyAction(state, engine.snapshot(state).currentActorId!, decision.action)).not.toThrow();
    }
  });
  it("keeps all variant input contracts and hidden holdings outside the policy", async () => {
    const f = fixture("flop-draw-facing-bet");
    const ctx = rulesContext(f.state, f.history, "structured", "medium", 100);
    expect(JSON.stringify(ctx)).not.toContain("engineState");
    const scenario = scenarios.find(s => s.id === "flop-draw-facing-bet")!;
    const used = new Set(scenario.deck);
    const replacements = ["Ac", "Ad", "Kc", "Kd", "Qs", "Qc"].filter(card => !used.has(card));
    const changedDeck = [...scenario.deck];
    changedDeck[0] = replacements[0]; changedDeck[2] = replacements[1];
    const changed = replayScenario({ ...scenario, deck: changedDeck });
    const changedContext = rulesContext(changed.state, changed.history, "structured", "medium", 100);
    expect(changedContext).toEqual(ctx);
    expect(structuredDecision(changedContext)).toEqual(structuredDecision(ctx));
    const frozen = structuredDecision(ctx);
    expect(structuredDecision({ ...ctx, sessionStats: undefined, strategyAdvice: undefined })).toEqual(frozen);
    for (const variant of variants) expect(await new ExperimentalRulesBot(variant).decide(ctx)).toBeDefined();
  });
});
describe("experimental evidence mechanics", () => {
  it("covers every difficulty, pot type, depth and 2–6-seat decision population", async () => {
    const result = await fixedCoverage(10);
    expect(new Set(result.rows.map(row => row.seats))).toEqual(new Set([2, 3, 4, 5, 6]));
    expect(new Set(result.rows.map(row => row.potType))).toEqual(new Set(["unopened", "limped", "raised", "re-raised", "unknown"]));
    expect(new Set(result.rows.map(row => row.difficulty))).toEqual(new Set(difficulties));
  }, 60_000);
  it("excludes entire seed blocks after failures and bootstraps paired whole-block differences", async () => {
    const result = await compare("passive", "medium", 2, 2, 10);
    expect(result.completeBlocks).toBe(2);
    expect(result.profits).toHaveLength(12);
    expect(result.excluded).toEqual([]);
    const failed = await compare("passive", "medium", 2, 2, 10, async (...args) => {
      if (args[0] === "facts" && args[4] === 1 && args[5] === 1) throw new Error("fixture failure");
      return playHand(...args);
    });
    expect(failed.completeBlocks).toBe(1);
    expect(failed.excluded).toEqual([{ seed: 1, failures: [{ rotation: 1, variant: "facts", reason: "Error: fixture failure" }] }]);
    expect(failed.paired["structured-frozen"]).toBeNull();
    expect(bootstrapInterval([2, 2, 2])?.confidence95).toEqual([2, 2]);
    expect(bootstrapInterval([1, 2, 3])).toEqual(bootstrapInterval([1, 2, 3]));
    expect(bootstrapInterval([1])).toBeNull();
    await expect(playHand("structured", "passive", "medium", 2, 0, 1, 10,
      { async decide() { throw new Error("deliberate failure"); } })).rejects.toThrow("deliberate failure");
  });
  it("incremental match inputs exactly match full privacy-safe history replay", async () => {
    for (const variant of variants) await playHand(variant, "aggressive", "medium", 6, 0, 2, 10, undefined,
      (state, history, actual, isSubject) => {
        expect(actual).toEqual(rulesContext(state, history, isSubject ? variant : "frozen", "medium", isSubject ? 10 : 1));
      });
  }, 30_000);
  it("range contrasts stay heads-up, conditional, reproducible and separate from random equity", () => {
    const rows = rangeSensitivity(100);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.range.conditionalOnSuppliedRanges)).toBe(true);
    expect(rangeSensitivity(100)).toEqual(rows);
    expect(() => structuredDecision(context("flop-made-facing-bet"), NaN)).toThrow();
  });
});
