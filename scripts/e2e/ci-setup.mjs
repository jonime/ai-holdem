import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "./process.mjs";
import { installCIBrowsers } from "./ci-browser-install.mjs";

/** Independent setup tasks overlap, but both must exit before checks or teardown. */
export async function setupCI(runCommand = run, env = process.env, platform = process.platform) {
  if (env.CI !== "true") throw new Error("Integration setup is CI-only.");
  const results = await Promise.allSettled([
    installCIBrowsers(env, runCommand, platform),
    runCommand(process.execPath, [resolve("scripts/e2e/supabase.mjs")], {
      env, phase: "supabase-setup", timeout: 720_000,
    }),
  ]);
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Integration setup failed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await setupCI();
}
