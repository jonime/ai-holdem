import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

export function localEnvironment() {
  let status;
  try {
    status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
    }));
  } catch {
    throw new Error("Local Supabase status failed; start a healthy local stack first.");
  }
  let url;
  try { url = new URL(status.API_URL); } catch { throw new Error("Local status must provide a valid loopback HTTP origin."); }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Only a loopback local Supabase HTTP origin is allowed.");
  }
  for (const key of ["ANON_KEY", "SERVICE_ROLE_KEY"]) {
    if (typeof status[key] !== "string" || !status[key]) throw new Error(`Local status is missing ${key}.`);
  }
  if (process.env.GITHUB_ACTIONS) {
    // Register before any child can emit a credential. Never dump status.
    for (const value of Object.values(status)) {
      if (typeof value === "string" && value && !value.includes("\n")) process.stdout.write(`::add-mask::${value}\n`);
    }
  }
  return {
    USAGE_LIMIT_HASH_SECRET: randomBytes(32).toString("hex"), USAGE_LIMIT_TEST_IP: "127.0.0.1", VERCEL: "",
    PORT: "3002", NEXT_DIST_DIR: ".next-e2e",
    NEXT_PUBLIC_APP_URL: "http://localhost:3002",
    NEXT_PUBLIC_SUPABASE_URL: url.origin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
    TYPESAFE_API_KEY: "", LLM_API_ENDPOINT: "", LLM_API_KEY: "",
    LLM_BOT_MODELS: JSON.stringify([{ id: "llm-test-model", label: "LLM Test Model", modelId: "test/model" }]),
    EXTERNAL_INFERENCE_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1",
  };
}

export function rejectCIOverride() {
  if (process.env.CI && process.env.E2E_BASE_URL) throw new Error("E2E_BASE_URL is forbidden in CI.");
}
