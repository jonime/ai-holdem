import { execFileSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

function getLocalSupabaseEnvironment(): Record<string, string> {
  const output = execFileSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
  });
  const values = Object.fromEntries(
    output
      .split("\n")
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2].replace(/^\"|\"$/g, "")]),
  );

  const url = values.API_URL;
  const publishableKey = values.ANON_KEY;
  const secretKey = values.SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !secretKey) {
    throw new Error(
      "Local Supabase is running, but status did not provide API_URL, ANON_KEY, and SERVICE_ROLE_KEY",
    );
  }

  return {
    PORT: "3002",
    NEXT_DIST_DIR: ".next-e2e",
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    TYPESAFE_API_KEY: "e2e-not-used",
  };
}

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3002",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev",
    url: "http://localhost:3002",
    reuseExistingServer: false,
    timeout: 120_000,
    env: getLocalSupabaseEnvironment(),
  },
});
