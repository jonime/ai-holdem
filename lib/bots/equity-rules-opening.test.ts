import { describe, expect, it } from "vitest";
import { materialize, allocation } from "@/benchmarks/preflop-candidate/fixtures";
import { override } from "@/benchmarks/preflop-candidate/candidate";
import { context } from "@/benchmarks/preflop-action-value/experiment";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { applyConfirmedKingOpening, OpeningAwareEquityRulesBot } from "./equity-rules-opening";
import { EquityRulesV2Bot } from "./equity-rules-v2";
import { ServerBotRegistry } from "./registry";
import type { BotContext } from "./types";

function fixture() {
  const f = materialize(allocation("screen")[0]);
  return context(f.state, [], "medium", 5000);
}

const measuredSettings = allocation("screen").filter(s => s.target === "medium-kk" && s.replicate === 1);

describe("confirmed medium king opening", () => {
  it.each(measuredSettings)("matches the frozen candidate through the registry: combo $combo hand $handNumber", async (spec) => {
    const bot = new ServerBotRegistry().get({ botId: "equity-rules-v2" }).bot;
    expect(bot).toBeInstanceOf(OpeningAwareEquityRulesBot);
    const baseline = new EquityRulesV2Bot();
    expect(measuredSettings).toHaveLength(24);
    const f = materialize(spec), input = context(f.state, [], "medium", 5000);
    const old = await baseline.decide(input), decision = await bot.decide(input);
    expect(input.analysis.equitySamples).toBe(5000);
    expect(old.action).toEqual({ type: "fold" });
    expect(decision.action).toEqual(override(input, old, { "medium-kk": "raise3" }).action);
    expect(() => engine.applyAction(f.state, f.heroId, decision.action)).not.toThrow();
    expect(decision.diagnostics.matchedRule).toBe("rules-confirmed-medium-kk-opening");
    expect(decision.rawResponse).toBeNull();
  }, 10000);

  it("returns the exact baseline outside the measured guard, including QQ and existing non-fold actions", async () => {
    const c = fixture(), old = await new EquityRulesV2Bot().decide(c);
    const changes: Partial<BotContext>[] = [
      { difficulty: "easy" }, { difficulty: "hard" },
      { hero: { ...c.hero, holeCards: ["Qc", "Qd"] } },
      { hero: { ...c.hero, holeCards: ["Ac", "Ad"] } },
      { hero: { ...c.hero, position: "cutoff" } },
      { hero: { ...c.hero, investedThisStreet: 1 } },
      { hero: { ...c.hero, stack: 199 } },
      { hand: { ...c.hand, street: "flop", communityCards: ["Ac", "2d", "3h"] } },
      { hand: { ...c.hand, communityCards: ["Ac"] } },
      { situation: undefined },
      { situation: { ...c.situation!, historyStatus: "unknown" } },
      { situation: { ...c.situation!, preflop: "limped" } },
      { situation: { ...c.situation!, preflop: "raised" } },
      { situation: { ...c.situation!, activeOpponentCount: 4 } },
      { opponents: c.opponents.slice(1) },
      { opponents: c.opponents.map((o, i) => i === 0 ? { ...o, stack: o.stack - 1 } : o) },
      { opponents: c.opponents.map((o, i) => i === 0 ? { ...o, status: "all_in" } : o) },
      { opponents: c.opponents.map((o, i) => i === 0 ? { ...o, status: "folded" } : o) },
      { game: { ...c.game, bigBlind: 0 } },
      { actionHistory: [{ sequence: 1, actorSeat: 1, actor: "opponent", controller: "human", street: "preflop", action: "fold", amount: null }] },
    ];
    for (const change of changes) expect(applyConfirmedKingOpening({ ...c, ...change }, old)).toBe(old);
    for (const action of [{ type: "call", amount: 2 }, { type: "raise", amount: 4 }, { type: "check" }] as const) {
      const decision = { ...old, action };
      expect(applyConfirmedKingOpening(c, decision)).toBe(decision);
    }
    const qq = { ...c, difficulty: "hard" as const, hero: { ...c.hero, holeCards: ["Qc", "Qd"] as const } };
    expect(await new OpeningAwareEquityRulesBot().decide(qq)).toEqual(await new EquityRulesV2Bot().decide(qq));
  });

  it("fails visibly for illegal target raises and follows the existing sizing diagnostic convention", async () => {
    const c = fixture(), old = await new EquityRulesV2Bot().decide(c);
    expect(() => applyConfirmedKingOpening({ ...c, legalActions: [] }, old)).toThrow("legal raise missing");
    for (const bounds of [{ minAmount: 7, maxAmount: 200 }, { minAmount: 4, maxAmount: 5 }]) {
      expect(() => applyConfirmedKingOpening({ ...c, legalActions: [{ type: "raise", ...bounds }] }, old)).toThrow("out of bounds");
    }
    const input = { ...c, sizingOptions: [{ choice: "full_pot" as const, amount: 6, description: "" }] };
    expect(applyConfirmedKingOpening(input, old).diagnostics.sizing).toEqual({ choice: "full_pot", probabilities: null, confidence: null });
    expect(applyConfirmedKingOpening({ ...c, sizingOptions: [] }, old).diagnostics.sizing).toBeNull();
  });
});
