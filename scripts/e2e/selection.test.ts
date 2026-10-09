import { describe, expect, it } from "vitest";
import { selectionArguments } from "./selection.mjs";

describe("production browser suite selection", () => {
  it.each([["smoke", "@smoke"], ["ui", "@ui-regression"], ["ci", "@smoke|@ui-regression"]])("selects %s", (suite, tag) => {
    expect(selectionArguments(suite)).toEqual(["--grep", tag]);
    expect(selectionArguments(suite, ["--list"])).toEqual(["--grep", tag, "--list"]);
  });
  it.each(["smoke", "ui"])("preserves local file filters for %s", suite => {
    expect(selectionArguments(suite, ["test/e2e/dialogs.spec.ts"])).toEqual([
      "--grep", suite === "smoke" ? "@smoke" : "@ui-regression", "test/e2e/dialogs.spec.ts",
    ]);
  });
  it.each(["smoke", "ui"])("preserves explicit local grep overrides for %s", suite => {
    for (const args of [["--grep", "claim"], ["--grep", ""], ["--grep=claim"], ["-g", "claim"], ["-g=claim"], ["test/e2e/dialogs.spec.ts", "--grep", ""]]) {
      expect(selectionArguments(suite, args)).toEqual(args);
    }
  });
  it.each([
    ["test/e2e/dialogs.spec.ts"], ["--grep", "@smoke"], ["--grep=@smoke"], ["-g", "claim"],
    ["--grep-invert", "@ui-regression"], ["--shard=1/2"], ["--config", "other.ts"],
    ["--project", "other"], ["--only-changed"], ["--last-failed"], ["--test-list", "subset.txt"],
    ["--pass-with-no-tests"], ["--", "dialogs"], ["--list", "--grep", "claim"],
  ])("rejects combined selection overrides %j", (...args) => {
    expect(() => selectionArguments("ci", args)).toThrow("overrides are forbidden");
  });
  it.each(["smoke", "ui"])("rejects empty-selection success for %s", suite => {
    expect(() => selectionArguments(suite, ["--pass-with-no-tests"])).toThrow("must fail");
  });
  it("rejects unknown suite names", () => {
    expect(() => selectionArguments("other")).toThrow("Unknown");
  });
});
