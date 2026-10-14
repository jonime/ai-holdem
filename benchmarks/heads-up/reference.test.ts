import { describe, it, expect } from "vitest";
import { handClasses, buildPreflopNode, preflopNodes, playEvaluationHand } from "../poker-context-harness";
import { fixedOpponent } from "../heads-up-pilot";
import { emptyDiagnostics } from "@/lib/bots/types";
import { createMoveOptions } from "@/lib/typesafe/questions";
import { importReference, exactSituation, matchReference, sampleEntry, seededRandom, scoreReference, frequencyDeviation, type Reference } from "./reference";
import { RequestBudget, BudgetExhausted, pairedMatches, summarizeMatches, chartVariants } from "./experiment";
import { referenceFixture, offlineReferenceControl } from "./decisions";
import { memoryFixtures, historyKinds, evaluateMemory } from "./memory";

function fixture() { return buildPreflopNode(preflopNodes.find(n => n.id === "HU-open")!, ["As", "Ks"], "facts", 5); }
function synthetic(): Reference {
  const f = fixture();
  const entry = { actions: createMoveOptions(f.context).map((m, i) => ({ action: "amount" in m.action ? { type: m.action.type, amountBB: m.action.amount! / 2 } : m.action,
    frequency: i === 0 ? 1 : 0, evBB: i })) };
  return importReference({ version: "hu-reference-v1", dataVersion: "TEST_ONLY_NOT_A_STRATEGY", source: {
    url: "https://example.invalid", revision: "test", attribution: "Synthetic mechanics fixture", codeLicense: "test", dataTerms: "test", redistribution: "permitted",
    generation: "Synthetic test only", stackConvention: "before_blinds", actionConvention: "raise_bet_to_call_additional_bb", actionTree: "test menu", postflopModel: "not a solver",
    convergence: "none", limitations: ["Not a poker reference"], independentChecks: ["none; test only"],
  }, nodes: [{ id: "open", split: "held-out", situation: exactSituation(f.state, f.history), opponentRange: "test-range", assumptions: "test only",
    ev: { units: "BB_per_decision", baseline: "test", assumptions: "test" }, hands: Object.fromEntries(handClasses.map(h => [h.notation, entry])) }] });
}
describe("evaluation reference mechanics (synthetic; no strength evidence)", () => {
  it("validates all 169 classes and 1326 combination weights", () => {
    expect(handClasses).toHaveLength(169); expect(handClasses.reduce((s, h) => s + h.weight, 0)).toBe(1326);
    expect(new Set(handClasses.map(h => h.weight))).toEqual(new Set([6,4,12]));
    for (const h of handClasses) { const f = buildPreflopNode(preflopNodes.find(n => n.id === "HU-open")!, h.cards, "facts", 1); expect(matchReference(synthetic(), f.state, f.history, f.context).supported).toBe(true); }
  });
  it("rejects malformed frequencies, missing classes, undocumented sources and duplicate nodes", () => {
    for (const change of [(d: Reference) => { d.nodes[0].hands.AA.actions[0].frequency = .9; },
      (d: Reference) => { delete d.nodes[0].hands.AA; }, (d: Reference) => { d.source.dataTerms = ""; },
      (d: Reference) => { d.nodes.push(d.nodes[0]); }, (d: Reference) => { d.nodes[0].hands.AA.actions[0].evBB = NaN; }]) {
      const data = synthetic(); change(data); expect(() => importReference(data)).toThrow();
    }
  });
  it("matches without using hidden opponent cards and runs the independent control", () => {
    const data = synthetic(), node = data.nodes[0];
    const a = referenceFixture(node, ["As", "Ks"], 5, ["2h", "3h"]);
    const b = referenceFixture(node, ["As", "Ks"], 5, ["Qh", "Qd"]);
    expect(matchReference(data, a.state, a.history, a.context)).toEqual(matchReference(data, b.state, b.history, b.context));
    expect(offlineReferenceControl(data)).toHaveLength(169);
  });
  it("samples frequencies reproducibly without confidence distributions", () => {
    const entry = { actions: [{ action: { type: "fold" as const }, frequency: .25 }, { action: { type: "raise" as const, amountBB: 3 }, frequency: .75 }] };
    const a = seededRandom(42), b = seededRandom(42);
    const draws = Array.from({ length: 10000 }, () => sampleEntry(entry, 2, a));
    expect(draws).toEqual(Array.from({ length: 10000 }, () => sampleEntry(entry, 2, b)));
    expect(draws.filter(a => a.type === "fold").length / 10000).toBeCloseTo(.25, 1);
    expect(() => sampleEntry(entry, 2, () => 1)).toThrow();
  });
  it("requires exact stack, commitments, line, menu and independent range for scoring", () => {
    const f = fixture(), data = synthetic(), match = matchReference(data, f.state, f.history, f.context);
    expect(match.supported).toBe(true);
    const moves = createMoveOptions(f.context);
    expect(scoreReference(match, f.context, moves[0].action, "test-range")?.regretBB).toBe(moves.length - 1);
    expect(scoreReference(match, f.context, moves[0].action, "wrong-range")).toBeNull();
    expect(scoreReference(match, f.context, { type: "raise", amount: 6.01 }, "test-range")).toBeNull();
    const withoutEV = synthetic();
    delete withoutEV.nodes[0].ev;
    for (const entry of Object.values(withoutEV.nodes[0].hands)) for (const action of entry.actions) delete action.evBB;
    const descriptive = matchReference(importReference(withoutEV), f.state, f.history, f.context);
    expect(scoreReference(descriptive, f.context, moves[0].action, "test-range")?.regretBB).toBeNull();
    data.nodes[0].situation.startingStacksBB = [25,25];
    expect(matchReference(data, f.state, f.history, f.context).supported).toBe(false);
    const unsupported = synthetic(); unsupported.nodes[0].hands.AKs.actions[0] = { action: { type: "raise", amountBB: 3.123 }, frequency: 1, evBB: 0 };
    expect(matchReference(unsupported, f.state, f.history, f.context)).toEqual({ supported: false, reason: "positive_action_outside_candidate_menu" });
    expect(frequencyDeviation({ actions: [{ action: { type: "fold" }, frequency: 1 }] }, [{ type: "call", amount: 1 }], 2)).toBe(1);
  });
  it("falls back unchanged and keeps reference EVs out of advice", async () => {
    const f = fixture(), data = synthetic(); const requests: unknown[] = [];
    const client = { async evaluate(request: Parameters<import("@/lib/typesafe/decision").TypesafeDecisionClient["evaluate"]>[0]) {
      requests.push(request); const keys = Object.keys(request.questions.move.criteria); const choice = keys[0];
      return { answers: { move: { type: "choice", choice, confidence: 1, probabilities: Object.fromEntries(keys.map(k => [k, Number(k === choice)])) } } };
    } };
    const bots = chartVariants(client, data, c => matchReference(data, f.state, f.history, c), seededRandom(7));
    await bots.advisory.decide(f.context); expect(JSON.stringify(requests[0])).not.toContain("evBB");
    await bots.hybrid.decide(f.context); expect(requests).toHaveLength(1); expect(bots.coverage.avoided).toBe(1);
    data.nodes[0].situation.commitmentsBB = [1,1]; await bots.hybrid.decide(f.context); expect(requests).toHaveLength(2);
  });
  it("reserves before every attempt, including failures and concurrent requests", async () => {
    const budget = new RequestBudget(2); let calls = 0;
    const client = budget.client({ async evaluate() { calls++; throw new Error("failure"); } }, "memory");
    await Promise.allSettled([client.evaluate({ model: "jev-latest", state: {}, questions: {} }), client.evaluate({ model: "jev-latest", state: {}, questions: {} })]);
    expect(() => client.evaluate({ model: "jev-latest", state: {}, questions: {} })).toThrow(BudgetExhausted);
    expect(calls).toBe(2); expect(budget.used).toBe(2); expect(() => new RequestBudget(1001)).toThrow();
  });
  it("preserves paired deal symmetry and excludes unfinished blocks", async () => {
    const passive = fixedOpponent(false);
    const observed: { seat: number; cards: readonly string[]; statsPresent: boolean }[] = [];
    const recorder = { async decide(context: import("@/lib/bots/types").BotContext) {
      observed.push({ seat: context.hero.seat, cards: context.hero.holeCards, statsPresent: !!context.sessionStats });
      return passive.decide(context);
    } };
    const result = await pairedMatches(recorder, { hybrid: recorder }, { passive }, 2, undefined, undefined, 5);
    expect(observed.every(o => o.statsPresent)).toBe(true);
    expect(observed.slice(0, 8).map(o => o.cards)).toEqual(observed.slice(8, 16).map(o => o.cards));
    expect(result.rows).toHaveLength(8); expect(result.summaries[0].pairedDifferenceBB100).toBe(0);
    expect(result.rows.slice(0,4).map(r => r.seed)).toEqual([10001,10001,10001,10001]);
    result.rows[0].profitBB = null; expect(summarizeMatches(result.rows)[0].completeBlocks).toBe(1);
    const stopped = await pairedMatches({ async decide() { throw new BudgetExhausted(); } }, { hybrid: passive }, { passive }, 3);
    expect(stopped.rows).toHaveLength(4); expect(stopped.summaries[0].completeBlocks).toBe(0); expect(stopped.exhausted).toBe(true);
  });
  it("finishes hands exceeding both old pilot limits", async () => {
    let calls = 0;
    const slow = { async decide(context: import("@/lib/bots/types").BotContext) {
      calls++; const raise = context.legalActions.find(a => a.type === "raise" || a.type === "bet");
      const passive = context.legalActions.find(a => a.type === "call" || a.type === "check");
      return { action: calls < 20 && raise && (raise.type === "raise" || raise.type === "bet") ? { type: raise.type, amount: raise.minAmount } : passive?.type === "call" || passive?.type === "check" ? passive : { type: "fold" as const }, diagnostics: emptyDiagnostics(), rawResponse: null };
    } };
    const hand = await playEvaluationHand(slow, slow, 2, 0, 1, "facts"); expect(hand.actionCount).toBeGreaterThan(12); expect(hand.diagnostics.length).toBeGreaterThan(6);
  });
  it("validates memory histories and holds all supplied facts except opponent observations fixed", async () => {
    const fixtures = memoryFixtures(5); expect(fixtures).toHaveLength(6);
    for (const f of fixtures) {
      const contexts = historyKinds.map(k => f.contexts[k]);
      const withoutOpponent = (c: typeof contexts[number]) => ({ ...c, sessionStats: { ...c.sessionStats, participants: c.sessionStats?.participants.filter(p => p.role === "hero") } });
      expect(contexts.map(withoutOpponent)).toEqual([withoutOpponent(contexts[0]), withoutOpponent(contexts[0]), withoutOpponent(contexts[0])]);
      expect(contexts[0].sessionStats?.participants.find(p => p.role === "opponent")?.headsUp.bbSmallOpenFold.evidence).toBe("observed");
      expect(contexts[2].sessionStats?.participants.find(p => p.role === "opponent")?.headsUp.bbSmallOpenFold.evidence).toBe("insufficient");
    }
    expect(await evaluateMemory(fixedOpponent(false), fixtures)).toHaveLength(108);
  });
});
