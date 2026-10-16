import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { hash, verify } from "./integrity";
import { describe, expect, it } from "vitest";
import { emptyDiagnostics, type PokerBot } from "@/lib/bots/types";
import { pokerEngineAdapter as engine, createDeterministicDeck } from "@/lib/poker/adapter";
import { createPokerAIState } from "@/lib/poker/ai-state";
import { createLegacySizingOptions } from "@/lib/typesafe/questions";
import { alternatives, assertChips, context, deal, evaluate, groups, hands, rollout, summarize, type Group } from "./experiment";

const group: Group = { hand: "AA", seats: 2, opponent: "passive", difficulty: "medium", samples: 8, seeds: 2 };
const shover: PokerBot = { async decide(c) {
  const aggressive = c.legalActions.find(a => a.type === "raise" || a.type === "bet");
  const all = aggressive && (aggressive.type === "raise" || aggressive.type === "bet") ? { type: aggressive.type, amount: aggressive.maxAmount } : null;
  const call = c.legalActions.find(a => a.type === "call");
  const check = c.legalActions.find(a => a.type === "check");
  if (!all && !call && !check) throw new Error("No continuation");
  return { action: all ?? call ?? check!, diagnostics: emptyDiagnostics(), rawResponse: null };
} };
describe("offline preflop action values", () => {
  it("rejects changed or empty source freezes", () => {
    const dir = mkdtempSync(join(tmpdir(), "preflop-freeze-")), path = join(dir, "source.ts");
    try {
      writeFileSync(path, "original");
      verify({ [path]: hash("original") });
      writeFileSync(path, "changed");
      expect(() => verify({ [path]: hash("original") })).toThrow("Source freeze mismatch");
      expect(() => verify({})).toThrow("Empty source freeze");
    } finally { rmSync(dir, { recursive: true }); }
  });
  it("runs credential-free workers even with parent provider settings", () => {
    const output = execFileSync(process.execPath, ["benchmarks/preflop-action-value/run.mjs", "smoke"], {
      env: { ...process.env, TYPESAFE_API_KEY: "unit-test-sentinel", EEVO_API_KEY: "unit-test-sentinel", LLM_API_KEY: "unit-test-sentinel", EXTERNAL_INFERENCE_ENABLED: "true" }, encoding: "utf8",
    });
    expect(JSON.parse(output).complete).toBe(2);
    expect(output).not.toContain("unit-test-sentinel");
  });
  it("freezes 45,000 primary and 9,000 sensitivity blocks", () => {
    expect(groups).toHaveLength(180);
    expect(groups.filter(g => g.samples === 100).reduce((s, g) => s + g.seeds, 0)).toBe(45000);
    expect(groups.filter(g => g.samples === 1000).reduce((s, g) => s + g.seeds, 0)).toBe(9000);
  });
  it("conditions the right actor, preserves 52 unique cards, and deterministically pairs deals", () => {
    for (const seats of [2, 6] as const) for (const hand of Object.keys(hands) as (keyof typeof hands)[]) {
      const a = deal(hand, seats, 1), b = deal(hand, seats, 1), c = deal(hand, seats, 2);
      expect(a).toEqual(b);
      expect(a.deckHash).not.toBe(c.deckHash);
      expect(engine.snapshot(a.state).currentActorId).toBe(a.heroId);
      expect(engine.heroCards(a.state, a.heroId)).toEqual(hands[hand]);
      const allHoles = a.state.config.players.flatMap(p => engine.heroCards(a.state, p.id));
      expect(new Set(allHoles).size).toBe(seats * 2);
      assertChips(a.state);
    }
  });
  it("uses the current production Rules context and hides other holdings and future cards", () => {
    const a = deal("KK", 6, 1), b = deal("KK", 6, 2);
    const input = context(a.state, [], "medium", 8);
    expect(input).toEqual(context(b.state, [], "medium", 8));
    const ai = createPokerAIState(a.state, a.heroId, { correctedContext: false, difficulty: "medium", equitySamples: 8, historyStatus: "complete", decisionHistory: [] });
    expect(input).toEqual({ ...ai, sizingOptions: createLegacySizingOptions(ai) });
    expect(input.opponents.every(o => !("holeCards" in o))).toBe(true);
    expect(input.hand.communityCards).toEqual([]);
  });
  it("validates every first action and rejects illegal raise sizes", () => {
    const a = deal("AA", 2, 1);
    expect(alternatives(a.state, { type: "call", amount: 1 })).toHaveLength(4);
    expect(() => alternatives(a.state, { type: "raise", amount: 1 })).toThrow();
  });
  it("preserves decision-point stack accounting for folds, calls, raises and all-ins", async () => {
    const a = deal("AA", 2, 9), original = JSON.stringify(a.state);
    const folded = await rollout(a.state, a.heroId, { type: "fold" }, group);
    expect(folded.profitBB).toBe(0);
    for (const first of [{ type: "call", amount: 1 }, { type: "raise", amount: 6 }, { type: "raise", amount: 200 }] as const) {
      const result = await rollout(a.state, a.heroId, first, group, (state, c) => {
        expect(c.hero.seat).toBe(engine.decisionView(state).currentActorSeat);
        expect(c.hero.holeCards).toEqual(engine.heroCards(state, engine.snapshot(state).currentActorId!));
        expect(c.opponents.every(o => !("holeCards" in o))).toBe(true);
      }, shover);
      expect(result.actions).toBeLessThanOrEqual(200);
      expect(result.profitBB).toBeGreaterThanOrEqual(-99.5);
      expect(result.profitBB).toBeLessThanOrEqual(100.5);
    }
    expect(JSON.stringify(a.state)).toBe(original);
  });
  it("settles a split all-in pot with the blind offset intact", async () => {
    const waiting = engine.createGame({ smallBlind: 1, bigBlind: 2, seatCount: 2,
      players: [0, 1].map(seat => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, controller: "bot" as const, stack: 200 })) });
    // Deal order BB, SB; burns precede each street. The board plays a royal flush.
    const state = engine.startHand(waiting, createDeterministicDeck(["2c", "3c", "4d", "5d", "6c", "As", "Ks", "Qs", "7c", "Js", "8c", "Ts"]));
    expect((await rollout(state, "p0", { type: "raise", amount: 200 }, group)).profitBB).toBe(0.5);
  });
  it("pairs all arms, deduplicates exact baseline actions and reproduces results", async () => {
    let calls = 0;
    const fake: typeof rollout = async () => { calls++; return { profitBB: calls % 3, actions: 1, completion: "showdown" }; };
    const result = await evaluate(group, fake);
    expect(calls).toBe(result.rows.reduce((s, r) => s + r.uniqueActions, 0));
    expect(result.rows.every(r => r.uniqueActions >= 3 && r.uniqueActions <= 4)).toBe(true);
    expect(summarize(result).complete).toBe(2);
    expect(await evaluate({ ...group, seeds: 1 })).toEqual(await evaluate({ ...group, seeds: 1 }));
  });
  it("excludes entire seed blocks after one failure without fallback or replacement", async () => {
    let calls = 0;
    const failed: typeof rollout = async () => { calls++; if (calls === 2) throw new Error("Action limit exceeded"); return { profitBB: 3, actions: 1, completion: "showdown" }; };
    const result = await evaluate(group, failed), report = summarize(result);
    expect(result.rows[0].values).toEqual({});
    expect(result.rows[0].failure).toBe("action_limit");
    expect(report.complete).toBe(1);
    expect(report.excluded).toEqual([{ seed: 1, failure: "action_limit" }]);
    expect(report.comparisons.call.paired).toBeNull();
  });
});
