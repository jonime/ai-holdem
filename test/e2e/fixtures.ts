import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test as base } from "@playwright/test";

export * from "@playwright/test";

// One worker runs these tests sequentially. Reset only this isolated runner's
// IP bucket; owner allowances and admissions within each test remain intact.
export const test = base.extend<{ creationAllowance: void }>({
  creationAllowance: [async ({}, runTest, testInfo) => {
    if (process.env.E2E_PRODUCTION !== "true" || process.env.E2E_BASE_URL) {
      await runTest();
      return;
    }
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    const secret = process.env.USAGE_LIMIT_HASH_SECRET;
    const ip = process.env.USAGE_LIMIT_TEST_IP;
    if (!process.env.E2E_WORKSPACE || process.env.VERCEL === "1" || testInfo.config.workers !== 1 ||
        url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
        !secret || Buffer.byteLength(secret) < 32 || ip !== "127.0.0.1" ||
        !process.env.SUPABASE_SECRET_KEY) {
      throw new Error("Creation allowance fixtures require the isolated local production runner.");
    }
    const key = `creation:ip:${createHmac("sha256", secret).update(`ai-holdem:usage:v1:ip\0${ip}`).digest("hex")}`;
    const client = createClient(url.origin, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const reset = async () => {
      const { error } = await client.from("usage_allowances").delete().eq("key", key);
      if (error) throw new Error("Creation allowance fixture cleanup failed.");
    };
    await reset();
    try { await runTest(); } finally { await reset(); }
  }, { auto: true }],
});
