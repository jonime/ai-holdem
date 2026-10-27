import { run } from "./process.mjs";
import { deploymentURL } from "./deployment-target.mjs";

// No local server, database, environment files, build, or provider credentials.
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--list")) throw new Error("Production smoke accepts only --list; empty selections and overrides are forbidden.");
const url = deploymentURL(process.env.PRODUCTION_SMOKE_URL);
if (!/^[a-f0-9]{40}$/.test(process.env.PRODUCTION_SMOKE_SHA ?? "")) throw new Error("A validated deployed revision is required.");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/SUPABASE|DATABASE|TYPESAFE|EEVO|LLM_|VERCEL_.*TOKEN|GITHUB_TOKEN|E2E_|USAGE_LIMIT/.test(key)));
await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.deployment.config.ts", ...args], {
  env: { ...env, PRODUCTION_SMOKE_URL: url }, phase: "production-smoke", timeout: 420_000,
});
