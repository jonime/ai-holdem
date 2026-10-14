import { describe, expect, it } from "vitest";
import { calculateRangeEquity, type RangeEquityInput } from "./calculator";
import { fixtures, uniformRange } from "./fixtures";
import { calculateShowdownEquity } from "../baselines/random-equity-v1";

const weighted = fixtures.find(item => item.id === "river-weighted-joint")!.input;
function supported(input: RangeEquityInput) {
  const result = calculateRangeEquity(input);
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw new Error("Unsupported test calculation");
  return result;
}
describe("conditional range equity", () => {
  it("enumerates product weights conditioned on compatibility (sequential renormalization would give 1/4)", () => {
    // Three legal tuples have weights 1, 6, 3; hero wins only the weight-6 tuple.
    expect(supported(weighted).showdownShare).toBeCloseTo(0.6, 12);
  });
  it("agrees with exact weighted truth under seeded rejection sampling", () => {
    const sample = supported({ ...weighted, mode: "monte-carlo", sampleBudget: 5000 });
    expect(Math.abs(sample.showdownShare - 0.6)).toBeLessThan(4 * sample.standardError);
    expect(sample.confidence95[0]).toBeLessThan(0.6);
    expect(sample.confidence95[1]).toBeGreaterThan(0.6);
  });
  it("validates weighted fractional ties against another exactly enumerable case", () => {
    const input: RangeEquityInput = { hero: ["Ac", "Kd"], board: ["Ah", "7d", "2c", "Qc", "9h"],
      opponents: [{ provenance: "test-only-weighted-tie", combinations: [
        { cards: ["As", "Kh"], weight: 2 }, // half share
        { cards: ["Qh", "Qd"], weight: 3 }, // loss
        { cards: ["8h", "8d"], weight: 1 }, // win
      ] }], seed: "weighted-tie-v1", sampleBudget: 5000 };
    expect(supported(input).showdownShare).toBeCloseTo(1 / 3, 12);
    const sample = supported({ ...input, mode: "monte-carlo" });
    expect(Math.abs(sample.showdownShare - 1 / 3)).toBeLessThan(4 * sample.standardError);
  });
  it("normalizes scales, ignores zero and blocked weights, preserves provenance", () => {
    const changed = { ...weighted, opponents: weighted.opponents.map(range => ({ ...range,
      combinations: [...range.combinations.map(combo => ({ ...combo, weight: combo.weight * 10 })),
        { cards: ["Ah", "Ac"], weight: 200 }, { cards: ["8c", "8d"], weight: 0 }],
    })) };
    expect(supported(changed).showdownShare).toBeCloseTo(supported(weighted).showdownShare, 12);
    expect(supported(changed).provenance).toEqual(supported(weighted).provenance);
  });
  it("is reproducible and invariant to opponent/combination/card order", () => {
    const input = { ...weighted, mode: "monte-carlo" as const, sampleBudget: 1000 };
    const reverse = { ...input, opponents: [...input.opponents].reverse().map(range => ({ ...range,
      combinations: [...range.combinations].reverse().map(combo => ({ ...combo, cards: [...combo.cards].reverse() })),
    })) };
    expect(calculateRangeEquity(input)).toEqual(calculateRangeEquity(input));
    expect(calculateRangeEquity(reverse)).toEqual(calculateRangeEquity(input));
  });
  it("rejects invalid visible cards, weights, duplicate unordered holdings and budgets", () => {
    for (const weight of [-1, NaN, Infinity]) expect(() => calculateRangeEquity({ ...weighted,
      opponents: [{ provenance: "bad", combinations: [{ cards: ["Kh", "Kd"], weight }] }],
    })).toThrow();
    expect(() => calculateRangeEquity({ ...weighted, hero: ["Ah", "Ah"] })).toThrow();
    expect(() => calculateRangeEquity({ ...weighted, board: ["2x", "3d", "7h", "9s", "Jc"] })).toThrow();
    expect(() => calculateRangeEquity({ ...weighted, sampleBudget: 0 })).toThrow();
    expect(() => calculateRangeEquity({ ...weighted, opponents: [{ provenance: "duplicate", combinations: [
      { cards: ["Kh", "Kd"], weight: 1 }, { cards: ["Kd", "Kh"], weight: 0 },
    ] }] })).toThrow("Duplicate");
  });
  it("rejects empty, zero, blocked and impossible joint ranges", () => {
    for (const combinations of [[], [{ cards: ["Kh", "Kd"], weight: 0 }], [{ cards: ["Ah", "Ac"], weight: 1 }]]) {
      expect(() => calculateRangeEquity({ ...weighted, opponents: [{ provenance: "empty", combinations }] })).toThrow();
    }
    const range = { provenance: "collision", combinations: [{ cards: ["Kh", "Kd"], weight: 1 }] };
    for (const board of [weighted.board, []]) expect(() => calculateRangeEquity({ ...weighted, board,
      opponents: [range, range] })).toThrow("Impossible joint");
  });
  it("reports unsupported without an estimate when bounded attempts are insufficient", () => {
    const result = calculateRangeEquity({ ...weighted, mode: "monte-carlo", attemptBudget: 1 });
    expect(result.status).toBe("unsupported");
    expect(result).not.toHaveProperty("showdownShare");
  });
  it("splits board-only ties among all opponents and handles exact wins/losses", () => {
    const tie = fixtures.find(item => item.id === "river-board-tie")!.input;
    expect(supported({ ...tie, opponents: [
      { provenance: "one", combinations: [{ cards: ["4c", "5d"], weight: 1 }] },
      { provenance: "two", combinations: [{ cards: ["6c", "7d"], weight: 1 }] },
    ] }).showdownShare).toBeCloseTo(1 / 3);
    expect(supported(fixtures.find(item => item.id === "river-known-nuts")!.input).showdownShare).toBe(1);
  });
  it("matches frozen uniform random equity within sampling-aware tolerance", () => {
    for (const opponentCount of [1, 2, 5]) {
      const input = { ...weighted, opponents: Array.from({ length: opponentCount }, () => uniformRange), sampleBudget: 1000 };
      const result = supported(input);
      const baseline = calculateShowdownEquity({ heroHoleCards: input.hero, communityCards: input.board,
        opponentCount, sampleCount: 1000, seed: "independent-uniform" });
      // Two independent bounded estimates: union-bound Hoeffding tolerance.
      expect(Math.abs(result.showdownShare - baseline)).toBeLessThan(2 * Math.sqrt(Math.log(80) / 2000) + 0.0001);
    }
  });
  it("takes only explicit public inputs; hidden holdings cannot alter its result", () => {
    const game = { visibleInput: weighted, hiddenOpponentCards: ["Kh", "Kd"] };
    const before = calculateRangeEquity(game.visibleInput);
    game.hiddenOpponentCards = ["Jh", "Jd"];
    expect(calculateRangeEquity(game.visibleInput)).toEqual(before);
    const guardedInput = { ...weighted,
      get hiddenOpponentCards(): never { throw new Error("Hidden cards must not be accessed"); },
      get history(): never { throw new Error("History must not be accessed"); },
    };
    expect(calculateRangeEquity(guardedInput)).toEqual(before);
    expect(Object.keys(weighted).sort()).toEqual(["board", "hero", "opponents", "sampleBudget", "seed"]);
  });
});
