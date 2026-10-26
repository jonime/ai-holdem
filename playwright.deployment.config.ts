import { defineConfig, devices } from "@playwright/test";
import { deploymentURL } from "./scripts/e2e/deployment-target.mjs";

export default defineConfig({
  testDir: "./test/deployment",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  globalTimeout: 390_000,
  reporter: [["list"]],
  outputDir: "test-results/production-smoke",
  use: {
    baseURL: deploymentURL(process.env.PRODUCTION_SMOKE_URL),
    trace: { mode: "retain-on-failure", snapshots: false, sources: false, screenshots: true },
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
