import { describe, expect, it } from "vitest";

import {
  analyzePreflopFeatures,
  deriveBoardTexture,
  evaluateMadeHand,
  summarizeDraws,
} from "./hand-analysis";

describe("equity rules hand analysis", () => {
  it("classifies premium and suited holdings", () => {
    expect(analyzePreflopFeatures(["Ah", "As"]).tier).toBe("premium");
    expect(analyzePreflopFeatures(["Ah", "2h"]).suited).toBe(true);
    expect(analyzePreflopFeatures(["Ah", "7s"]).gap).toBeGreaterThanOrEqual(2);
  });

  it("detects made hands and draw flags", () => {
    const made = evaluateMadeHand(["Ah", "Kd"], ["As", "7d", "2c", "Qc", "9h"]);
    expect(made.category).toBe("one-pair");
    const draws = summarizeDraws(["Ah", "Kd"], ["Qh", "Jh", "2c"]);
    expect(draws.flushDraw).toBe(true);
    expect(draws.straightDraw).toBe(true);
  });

  it("summarizes board texture", () => {
    expect(deriveBoardTexture(["2c", "4d", "7h", "9s", "Kc"]).label).toBe(
      "dry",
    );
    expect(deriveBoardTexture(["2c", "3c", "4c", "5d", "7s"]).label).toBe(
      "wet",
    );
  });
});
