import { describe, expect, it } from "vitest";
import { openRouterPilotFetch, pilotIds, pilotModels, pilotCases, evaluatePilotCases, evaluatePilotMatches, fixedOpponent } from "./heads-up-pilot";
import { handClasses, buildPreflopNode, preflopNodes } from "./poker-context-harness";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { selectPokerAdvice } from "@/lib/poker/strategy-advice";
import { type PokerBot } from "@/lib/bots/types";

describe("bounded heads-up pilot", () => {
  it("covers all 169 classes and correct combination weights at 10/25/100 BB and unequal stacks", () => {
    expect(handClasses.reduce((sum, hand) => sum + hand.weight, 0)).toBe(1326);
    for (const depth of [10, 25, 100]) for (const hand of handClasses) for (const id of ["HU-open", "HU-defend"]) {
      const fixture = buildPreflopNode(preflopNodes.find(node => node.id === id)!, hand.cards, "facts", 5, { stackBB: depth, opponentStackBB: 100 });
      expect(fixture.context.hero.holeCards).toEqual(hand.cards);
      expect(fixture.context.situation?.dealtPlayerCount).toBe(2);
      expect(selectPokerAdvice(fixture.context).scope).toBe("heads_up");
      expect(fixture.context.analysis.effectiveStack).toBeLessThanOrEqual(depth * 2);
    }
  });
  it("defines exactly 40 fixed legal decisions with factual, bounded history", () => {
    const cases = pilotCases(5);
    expect(cases).toHaveLength(40);
    expect(new Set(cases.map(fixture => fixture.id)).size).toBe(40);
    for (const fixture of cases) {
      expect(fixture.context.sessionStats?.coverage).toMatchObject({ status: "complete", selectedHands: 20, validatedHands: 20 });
      expect(fixture.context.legalActions.length).toBeGreaterThan(0);
      expect(fixture.context.situation?.dealtPlayerCount).toBe(2);
      const valid = fixture.context.legalActions[0];
      expect(() => engine.applyAction(fixture.state, engine.snapshot(fixture.state).currentActorId!,
        valid.type === "bet" || valid.type === "raise" ? { type: valid.type, amount: valid.minAmount } : valid)).not.toThrow();
    }
  }, 30000);
  it("counts every failed attempt and preserves sanitized partial progress", async () => {
    const fixture = buildPreflopNode(preflopNodes.find(node => node.id === "HU-open")!, ["As", "Ks"]);
    const failing: PokerBot = { async decide() { throw new Error("secret provider message"); } };
    const variants = Object.fromEntries(pilotIds.map(id => [id, failing])) as Record<typeof pilotIds[number], PokerBot>;
    const budget = { remaining: 16 };
    const rows = await evaluatePilotCases(variants, budget, [{ id: "case", ...fixture, forbidden: [], missedValue: [], overAggression: [] }]);
    expect(rows).toHaveLength(16);
    expect(budget.remaining).toBe(0);
    expect(rows.every(row => row.failure === "provider")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("secret");

  });
  it("reserves complete match blocks and excludes every incomplete block", async () => {
    let calls = 0;
    const bot: PokerBot = { async decide() { calls++; throw new Error("private failure"); } };
    const variants = Object.fromEntries(pilotIds.map(id => [id, bot])) as Record<typeof pilotIds[number], PokerBot>;
    expect((await evaluatePilotMatches(variants, { remaining: 95 }, { pressure: fixedOpponent(true) }, undefined, 101, 5)).rows).toHaveLength(0);
    expect(calls).toBe(0);
    const report = await evaluatePilotMatches(variants, { remaining: 96 }, { pressure: fixedOpponent(true) }, undefined, 101, 5);
    expect(report.rows).toHaveLength(16);
    expect(report.rows.every(row => row.profitBB === null)).toBe(true);
    expect(report.comparisons.every(comparison => comparison.completeBlocks === 0 && comparison.interval === null)).toBe(true);
    expect(calls).toBe(16);
  }, 30000);

  it("disables gateway fallbacks, requires parameter support and rejects a substituted model", async () => {
    let request: unknown;
    const fetcher = openRouterPilotFetch(async (_url, init) => {
      request = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ model: pilotModels.mini }));
    });
    await expect(fetcher("https://openrouter.ai/api/v1/chat/completions", { body: JSON.stringify({ model: pilotModels.nano }) })).rejects.toThrow("unexpected model");
    expect(request).toMatchObject({ provider: { allow_fallbacks: false, require_parameters: true } });
    await expect(fetcher("https://other.invalid", { body: "{}" })).rejects.toThrow("configured OpenRouter");
  });
});
