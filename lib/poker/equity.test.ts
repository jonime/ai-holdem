import { describe, expect, it } from "vitest";

import { calculateShowdownEquity } from "./equity";

describe("calculateShowdownEquity", () => {
  it("returns full equity for an unbeatable river hand", () => {
    expect(
      calculateShowdownEquity({
        heroHoleCards: ["As", "Ah"],
        communityCards: ["Ac", "Ad", "2c", "3d", "4h"],
        opponentCount: 3,
        sampleCount: 100,
      }),
    ).toBe(1);
  });

  it("splits equity when the board is the best hand", () => {
    expect(
      calculateShowdownEquity({
        heroHoleCards: ["2c", "3d"],
        communityCards: ["As", "Ks", "Qs", "Js", "Ts"],
        opponentCount: 2,
        sampleCount: 100,
      }),
    ).toBe(0.3333);
  });

  it("is deterministic for incomplete multiway boards", () => {
    const input = {
      heroHoleCards: ["As", "Kd"],
      communityCards: ["Jh", "7c", "2d"],
      opponentCount: 3,
      sampleCount: 250,
      seed: "repeatable",
    } as const;
    const first = calculateShowdownEquity(input);
    expect(calculateShowdownEquity(input)).toBe(first);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
  });

  it("rejects duplicate known cards", () => {
    expect(() =>
      calculateShowdownEquity({
        heroHoleCards: ["As", "As"],
        communityCards: [],
        opponentCount: 1,
        sampleCount: 1,
      }),
    ).toThrow("duplicate known cards");
  });
});
