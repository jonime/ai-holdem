import { describe, expect, it } from "vitest";
import { selectionArguments } from "./selection.mjs";

describe("production browser suite selection", () => {
  it.each([["smoke", "@smoke"], ["ui", "@ui-regression"], ["webkit", "@compatibility"], ["ci", "@smoke|@ui-regression|@compatibility"]])("selects %s", (suite, tag) => {
    const projects = suite === "ci" ? ["--project=chromium", "--project=webkit-desktop", "--project=webkit-mobile"]
      : suite === "webkit" ? ["--project=webkit-desktop", "--project=webkit-mobile"] : ["--project=chromium"];
    expect(selectionArguments(suite)).toEqual([...projects, "--grep", tag]);
    expect(selectionArguments(suite, ["--list"])).toEqual([...projects, "--grep", tag, "--list"]);
  });
  it.each(["smoke", "ui"])("preserves local file filters for %s", suite => {
    expect(selectionArguments(suite, ["test/e2e/dialogs.spec.ts"])).toEqual([
      "--project=chromium", "--grep", suite === "smoke" ? "@smoke" : "@ui-regression", "test/e2e/dialogs.spec.ts",
    ]);
  });
  it.each(["smoke", "ui"])("preserves explicit local grep overrides for %s", suite => {
    for (const args of [["--grep", "claim"], ["--grep", ""], ["--grep=claim"], ["-g", "claim"], ["-g=claim"], ["test/e2e/dialogs.spec.ts", "--grep", ""]]) {
      expect(selectionArguments(suite, args)).toEqual(["--project=chromium", ...args]);
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
  it.each(["smoke", "ui", "webkit"])("rejects empty-selection success for %s", suite => {
    expect(() => selectionArguments(suite, ["--pass-with-no-tests"])).toThrow("must fail");
  });
  it("preserves WebKit file filters and explicit local project selection", () => {
    expect(selectionArguments("webkit", ["test/e2e/compatibility.spec.ts"]))
      .toEqual(["--project=webkit-desktop", "--project=webkit-mobile", "--grep", "@compatibility", "test/e2e/compatibility.spec.ts"]);
    expect(selectionArguments("ui", ["--project=webkit-mobile", "--list"]))
      .toEqual(["--grep", "@ui-regression", "--project=webkit-mobile", "--list"]);
  });
  it("rejects unknown suite names", () => {
    expect(() => selectionArguments("other")).toThrow("Unknown");
  });
});
