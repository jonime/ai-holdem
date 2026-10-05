import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { run } from "./process.mjs";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "smoke-log-test-"));
  vi.stubEnv("E2E_LOG_DIR", directory);
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

it("redacts credentials across chunks and discards database statements", async () => {
  await run(process.execPath, ["-e", `
    process.stdout.write('status local-');
    setTimeout(() => {
      console.log('secret');
      console.log('postgresql://postgres:password@localhost/db');
      console.log('INSERT INTO public.games VALUES (private-data)');
      console.log('ready');
    }, 10);
  `], { env: { ...process.env, SUPABASE_SECRET_KEY: "local-secret" }, phase: "redaction", timeout: 5000 });
  const log = readFileSync(join(directory, "redaction.log"), "utf8");
  expect(log).toContain("[redacted]");
  expect(log).toContain("ready");
  expect(log).not.toContain("local-secret");
  expect(log).not.toContain("password");
  expect(log).not.toContain("private-data");
});

it("propagates a failed child and retains its useful diagnostic", async () => {
  await expect(run(process.execPath, ["-e", "console.error('test failure'); process.exit(1)"], {
    phase: "failure", timeout: 5000,
  })).rejects.toThrow("exit 1");
  expect(readFileSync(join(directory, "failure.log"), "utf8")).toContain("test failure");
});
