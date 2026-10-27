import { defineConfig, devices } from "@playwright/test";
import { publicOrigin } from "./scripts/e2e/production-revision.mjs";

export default defineConfig({
  testDir: "./test/deployment",
  testMatch: "journeys.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  timeout: 90_000,
  globalTimeout: 390_000,
  reporter: [["list"]],
  outputDir: "test-results/production-smoke",
  use: {
    baseURL: publicOrigin(process.env.PRODUCTION_SMOKE_URL),
    trace: { mode: "retain-on-failure", snapshots: false, sources: false, screenshots: true },
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
