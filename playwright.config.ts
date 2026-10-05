import { localEnvironment, rejectCIOverride } from "./scripts/e2e/local-environment.mjs";

import { defineConfig, devices } from "@playwright/test";

rejectCIOverride();

const externalBaseURL = process.env.E2E_BASE_URL;
const production = process.env.E2E_PRODUCTION === "true";
if (production && (!process.env.E2E_WORKSPACE || externalBaseURL)) throw new Error("Use npm run test:e2e:smoke for local production mode.");

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: externalBaseURL ?? "http://localhost:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseURL ? undefined : {
    command: production ? "node scripts/e2e/server.mjs" : "npx next dev",
    url: "http://localhost:3002",
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    env: production ? undefined : localEnvironment(),
  },
});
