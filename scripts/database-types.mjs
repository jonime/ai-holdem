import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CLI_VERSION = "2.119.0";
const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * @param {string} mode
 * @param {{ cwd?: string, environment?: Record<string, string | undefined>, run?: (file: string, args: string[], options: import("node:child_process").ExecFileSyncOptionsWithStringEncoding) => string }} options
 */
export function databaseTypes(mode, { cwd = root, run = execFileSync, environment = process.env } = {}) {
  if (mode !== "generate" && mode !== "check") throw new Error("Use database-types.mjs generate or check.");
  // Do not load .env files or pass application/provider/hosted credentials to the CLI.
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "XDG_CONFIG_HOME"]
    .flatMap(key => environment[key] === undefined ? [] : [[key, environment[key]]]));
  const execute = (args, phase) => {
    try {
      return run("supabase", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });
    } catch {
      // CLI stderr can contain status credentials. Keep diagnostics fixed and actionable.
      throw new Error(`Database types: ${phase} failed. Install Supabase CLI ${CLI_VERSION}, start local Supabase with Docker, and apply committed migrations locally.`);
    }
  };
  const version = execute(["--version"], "CLI version check").trim();
  if (version !== CLI_VERSION) throw new Error(`Database types require Supabase CLI ${CLI_VERSION}; found ${version}.`);
  const files = readdirSync(join(cwd, "supabase/migrations")).filter(name => name.endsWith(".sql"));
  const expected = files.map(name => name.split("_")[0]).sort();
  const migrations = JSON.parse(execute(["migration", "list", "--local", "--output-format", "json"], "local migration inspection"));
  const applied = migrations.migrations?.filter(row => row.remote != null && row.remote !== "").map(row => row.remote).sort();
  if (!Array.isArray(applied) || JSON.stringify(expected) !== JSON.stringify(applied)) {
    throw new Error("Local migrations differ from the repository. Apply every committed migration locally before generating or checking types.");
  }
  const target = join(cwd, "lib/supabase/database.generated.ts");
  const temporary = mkdtempSync(join(cwd, "lib/supabase/.database-types-"));
  try {
    const output = execute(["gen", "types", "typescript", "--local", "--schema", "public"], "local type generation");
    if (!output.includes("export type Database =") || !output.includes("export type Json =")) throw new Error("Local type generation returned invalid output.");
    const candidate = join(temporary, "database.generated.ts");
    writeFileSync(candidate, output);
    if (mode === "generate") renameSync(candidate, target);
    else if (!readFileSync(target).equals(readFileSync(candidate))) {
      throw new Error("Committed database types are stale. Run npm run db:types:generate and commit the unchanged generated output.");
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    databaseTypes(process.argv[2]);
    console.log(`Database types ${process.argv[2] === "check" ? "match the migrated local public schema" : "generated successfully"}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Database type command failed.");
    process.exitCode = 1;
  }
}
