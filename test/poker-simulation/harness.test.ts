import { describe, expect, it } from "vitest";
import { actionChoices, failureDiagnostic, generatedConfig, selectAction, simulate } from "./harness";
import { deriveSeed, seededRandom, shuffledDeck } from "./random";
import { simulationCases, simulationOptions } from "./options.mjs";

describe("simulation machinery", () => {
  it("has a fixed PRNG vector, unique complete decks and purpose-specific seeds", () => {
    const random = seededRandom(1);
    expect(Array.from({ length: 3 }, random)).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    const deck = shuffledDeck(42);
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(card => `${card.rank}${card.suit}`)).size).toBe(52);
    expect(shuffledDeck(42)).toEqual(deck);
    expect(shuffledDeck(43)).not.toEqual(deck);
    expect(deriveSeed(1, 3, 1, "deck")).not.toBe(deriveSeed(1, 3, 1, "actions"));
  });
  it("replays identically regardless of intervening cases", () => {
    const testCase = { seed: 7, seats: 3, hands: 3 };
    const first = simulate(testCase);
    simulate({ seed: 99, seats: 2, hands: 1 });
    expect(simulate(testCase)).toEqual(first);
    const stacks = generatedConfig(testCase).players.map(p => p.stack);
    expect(stacks[0]).toBeLessThan(10);
    expect(stacks.every(stack => stack >= 1 && stack <= 1000)).toBe(true);
    expect(new Set(stacks).size).toBeGreaterThan(1);
  });
  it("selects integer minimum/intermediate/maximum total-street targets", () => {
    expect(actionChoices([{ type: "raise", minAmount: 20, maxAmount: 101 }])).toEqual([
      { type: "raise", amount: 20 }, { type: "raise", amount: 60 }, { type: "raise", amount: 101 },
    ]);
    expect(actionChoices([{ type: "bet", minAmount: 3, maxAmount: 3 }])).toEqual([{ type: "bet", amount: 3 }]);
    const legal = [{ type: "fold" as const }, { type: "call" as const, amount: 10 }, { type: "raise" as const, minAmount: 20, maxAmount: 101 }];
    expect(selectAction(legal, 63, () => 0).policy).toBe("generated");
    expect(selectAction(legal, 64, () => { throw new Error("Must not draw after 64"); })).toEqual({ action: { type: "call", amount: 10 }, policy: "passive-after-64" });
    expect(selectAction([{ type: "check" }, ...legal], 127, () => 0).action).toEqual({ type: "check" });
  });
  it("validates commands and makes nonempty order-independent selections", () => {
    expect(simulationCases(simulationOptions())).toHaveLength(250);
    expect(simulationCases(simulationOptions(["--seed", "0", "--seats", "6", "--hands", "1"]))).toEqual([{ seed: 0, seats: 6, hands: 1 }]);
    expect(simulationOptions(["--seed", "4294967295"] ).seed).toBe(4294967295);
    for (const args of [["--seed"], ["--seed", "-1"], ["--seed", "4294967296"], ["--seats", "1"], ["--seats", "7"], ["--hands", "0"], ["--hands", "41"], ["--hands", "1.5"], ["--hands", "NaN"], ["--hands", "1", "--hands", "2"], ["--grep", "missing"]]) {
      expect(() => simulationOptions(args)).toThrow();
    }
  });
  it("reports a synthetic failing case, ordered actions, location, cause and reproduction", () => {
    const testCase = { seed: 9, seats: 2, hands: 1 };
    const diagnostic = failureDiagnostic(testCase, generatedConfig(testCase), 1, 2, [{ hand: 1, index: 1, actor: "synthetic-0", action: { type: "fold" }, policy: "generated" }]);
    expect(diagnostic).toContain("seed=9 seats=2 hand=1 action=2");
    expect(diagnostic).toContain('"action":{"type":"fold"}');
    expect(diagnostic).toContain("npm run test:poker:simulation -- --seed 9 --seats 2 --hands 1");
    expect(() => simulate(testCase, { name: "diagnostic failure", config: generatedConfig(testCase), choose: () => ({ type: "fold" }), observe: (_state, _index, hand) => { if (hand > 0) throw new Error("deliberate failure"); } })).toThrow("fixture=diagnostic failure");
  });
});
