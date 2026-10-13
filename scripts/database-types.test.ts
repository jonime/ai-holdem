import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseTypes } from "./database-types.mjs";

const generated = "export type Json = null;\nexport type Database = {};\n";
const directories: string[] = [];
function fixture(committed = generated) {
  const cwd = mkdtempSync(join(tmpdir(), "database-types-test-")); directories.push(cwd);
  mkdirSync(join(cwd, "supabase/migrations"), { recursive: true });
  mkdirSync(join(cwd, "lib/supabase"), { recursive: true });
  writeFileSync(join(cwd, "supabase/migrations/20261013000000_test.sql"), "");
  const target = join(cwd, "lib/supabase/database.generated.ts"); writeFileSync(target, committed);
  const run = vi.fn((_command: string, args: readonly string[]) => {
    if (args[0] === "--version") return "2.119.0\n";
    if (args[0] === "migration") return JSON.stringify({ migrations: [{ remote: "20261013000000" }] });
    return generated;
  });
  return { cwd, target, run };
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
describe("local database type tooling", () => {
  it("compares without modifying committed types and uses only local schema commands", () => {
    const f = fixture();
    databaseTypes("check", { ...f, environment: { PATH: "/bin", SUPABASE_ACCESS_TOKEN: "secret", DATABASE_URL: "hosted", SUPABASE_SECRET_KEY: "secret" } });
    expect(readFileSync(f.target, "utf8")).toBe(generated);
    expect(f.run.mock.calls.map(call => call[1])).toEqual([["--version"], ["migration", "list", "--local", "--output-format", "json"], ["gen", "types", "typescript", "--local", "--schema", "public"]]);
    expect(f.run).toHaveBeenLastCalledWith("supabase", expect.any(Array), expect.objectContaining({ env: { PATH: "/bin" } }));
    expect(readdirSync(join(f.cwd, "lib/supabase"))).toEqual(["database.generated.ts"]);
  });
  it("detects stale output without changing it", () => {
    const f = fixture("old"); expect(() => databaseTypes("check", f)).toThrow("stale");
    expect(readFileSync(f.target, "utf8")).toBe("old");
  });
  it("updates only after successful generation", () => {
    const f = fixture("old"); databaseTypes("generate", f); expect(readFileSync(f.target, "utf8")).toBe(generated);
  });
  it.each(["check", "generate"])("preserves committed output when CLI generation fails (%s)", mode => {
    const f = fixture("old"); f.run.mockImplementationOnce(() => "2.119.0").mockImplementationOnce(() => JSON.stringify({ migrations: [{ remote: "20261013000000" }] })).mockImplementationOnce(() => { throw new Error("secret CLI diagnostic"); });
    expect(() => databaseTypes(mode, f)).toThrow("local type generation failed");
    expect(readFileSync(f.target, "utf8")).toBe("old");
    expect(readdirSync(join(f.cwd, "lib/supabase"))).toEqual(["database.generated.ts"]);
  });
  it("rejects mismatched CLI versions before inspecting the database", () => {
    const f = fixture(); f.run.mockReturnValueOnce("2.120.0");
    expect(() => databaseTypes("generate", f)).toThrow("require Supabase CLI 2.119.0"); expect(f.run).toHaveBeenCalledTimes(1);
  });
  it("rejects missing CLI and unapplied migrations", () => {
    const f = fixture(); f.run.mockImplementationOnce(() => { throw new Error("ENOENT"); });
    expect(() => databaseTypes("generate", f)).toThrow("CLI version check failed");
    f.run.mockImplementationOnce(() => "2.119.0").mockImplementationOnce(() => '{"migrations":[]}');
    expect(() => databaseTypes("generate", f)).toThrow("Apply every committed migration");
  });
  it("preserves committed output on invalid generator output", () => {
    const f = fixture("old"); f.run.mockImplementationOnce(() => "2.119.0").mockImplementationOnce(() => JSON.stringify({ migrations: [{ remote: "20261013000000" }] })).mockReturnValueOnce("");
    expect(() => databaseTypes("generate", f)).toThrow("invalid output"); expect(readFileSync(f.target, "utf8")).toBe("old");
  });
});
