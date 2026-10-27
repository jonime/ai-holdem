import { run } from "./process.mjs";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publicOrigin } from "./production-revision.mjs";

// No local server, database, environment files, build, or provider credentials.
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--list")) throw new Error("Production smoke accepts only --list; empty selections and overrides are forbidden.");
const url = publicOrigin(process.env.PRODUCTION_SMOKE_URL);
// Use trusted validation checkout code even when the deployed revision predates these guards.
const trusted = fileURLToPath(new URL("../../", import.meta.url));
for (const file of ["playwright.deployment.config.ts", "test/deployment/fixtures.ts", "test/deployment/journeys.spec.ts",
  "test/e2e/realtime-observer.ts", "scripts/e2e/smoke-cleanup.mjs", "scripts/e2e/production-revision.mjs"]) {
  const source = resolve(trusted, file), destination = resolve(file);
  if (source !== destination) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
}
if (!/^[a-f0-9]{40}$/.test(process.env.PRODUCTION_SMOKE_SHA ?? "")) throw new Error("A validated deployed revision is required.");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/SUPABASE|DATABASE|TYPESAFE|EEVO|LLM_|VERCEL_.*TOKEN|GITHUB_TOKEN|E2E_|USAGE_LIMIT/.test(key)));
await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.deployment.config.ts", ...args], {
  env: { ...env, PRODUCTION_SMOKE_URL: url }, phase: "production-smoke", timeout: 420_000,
});
