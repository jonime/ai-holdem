/** Run the existing local SQL suites in CI order against an already-migrated stack. */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "./e2e/process.mjs";

// Keep each suite's former workflow deadline; never run these concurrently.
export const sqlSuites = [
  ["game-reads", 180_000],
  ["replay", 120_000],
  ["results", 120_000],
  ["shares", 120_000],
  ["creation", 180_000],
  ["my-games", 180_000],
  ["removal", 180_000],
  ["bot-context", 180_000],
  ["seats", 180_000],
  ["departures", 180_000],
  ["turn-timers", 120_000],
  ["bot-claims", 180_000],
  ["usage", 180_000],
];

export async function verifySQL(runCommand = run, env = process.env, log = console.log) {
  for (const [suite, timeout] of sqlSuites) {
    const script = `test:sql:${suite}`;
    log(`${env.GITHUB_ACTIONS === "true" ? "::group::" : "Running "}${script}`);
    try {
      await runCommand("npm", ["run", script], { env, phase: `sql-${suite}`, timeout });
    } finally {
      if (env.GITHUB_ACTIONS === "true") log("::endgroup::");
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifySQL();
}
