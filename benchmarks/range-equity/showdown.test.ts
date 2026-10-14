import { expect, it } from "vitest";
import { evaluateShowdownShare } from "./showdown";
it("compares category and ordered kickers through the adapter", () => {
  const board = ["Ah", "7d", "2c", "Qc", "9h"];
  expect(evaluateShowdownShare(["Ac", "Kd"], board, [["As", "Jd"]])).toBe(1);
  expect(evaluateShowdownShare(["Ac", "Jd"], board, [["As", "Kd"]])).toBe(0);
  expect(evaluateShowdownShare(["Ac", "Kd"], board, [["As", "Kh"]])).toBe(0.5);
  expect(evaluateShowdownShare(["Ac", "Kd"], board, [["Qh", "Qd"]])).toBe(0);
});
it("rejects incomplete or colliding holdings before evaluation", () => {
  expect(() => evaluateShowdownShare(["Ac", "Kd"], ["Ah"], [["Qh", "Qd"]])).toThrow();
  expect(() => evaluateShowdownShare(["Ac", "Kd"], ["Ah", "7d", "2c", "Qc", "9h"], [["Ac", "Qd"]])).toThrow();
});
