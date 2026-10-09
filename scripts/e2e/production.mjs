/** Build in an isolated source copy: Next must never open application .env files. */
import { constants, cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { localEnvironment, rejectCIOverride } from "./local-environment.mjs";
import { selectionArguments } from "./selection.mjs";
import { run } from "./process.mjs";

const browserArguments = selectionArguments(process.argv[2], process.argv.slice(3));
rejectCIOverride();
if (process.env.E2E_BASE_URL) throw new Error("Production browser verification requires local Supabase and port 3002.");
const root = process.cwd();
const local = localEnvironment();
const workspace = mkdtempSync(join(tmpdir(), "ai-holdem-smoke-"));
const env = { ...process.env, ...local, NODE_ENV: "production", E2E_PRODUCTION: "true", E2E_WORKSPACE: workspace };
try {
  for (const path of ["app", "components", "lib", "content", "public", "test", "benchmarks", "scripts", ...readdirSync(root).filter(name => !name.startsWith(".env") && /\.(?:[cm]?[jt]sx?|json)$/.test(name))]) {
    cpSync(resolve(root, path), join(workspace, path), { recursive: true, filter: source => !source.split(/[\\/]/).at(-1).startsWith(".env") });
  }
  cpSync(resolve(root, "node_modules"), join(workspace, "node_modules"), { recursive: true, mode: constants.COPYFILE_FICLONE });
  await run(process.execPath, [join(workspace, "node_modules/next/dist/bin/next"), "build"], { cwd: workspace, env, phase: "build", timeout: 480_000 });
  await run(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", ...browserArguments], { cwd: root, env, phase: "browser", timeout: 600_000 });
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
