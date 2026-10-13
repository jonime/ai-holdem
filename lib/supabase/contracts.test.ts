import { describe, expect, it } from "vitest";
import { toJson, toRequiredJson } from "./contracts";

describe("database JSON serialization", () => {
  it("preserves Supabase JSON serialization for undefined fields, arrays, dates and nonfinite numbers", () => {
    const input = { omitted: undefined, array: [undefined, NaN], date: new Date("2026-10-13T00:00:00Z") };
    expect(toJson(input)).toEqual(JSON.parse(JSON.stringify(input)));
  });
  it("rejects unserializable top-level values, cycles and bigint", () => {
    expect(() => toJson(undefined)).toThrow("not JSON serializable");
    expect(() => toJson(1n)).toThrow();
    const cycle: { self?: unknown } = {}; cycle.self = cycle;
    expect(() => toJson(cycle)).toThrow();
  });
  it("preserves null RPC JSON but rejects null in a required table JSON field", () => {
    expect(toJson(null)).toBeNull(); expect(() => toRequiredJson(null)).toThrow("must not be null");
  });
});
