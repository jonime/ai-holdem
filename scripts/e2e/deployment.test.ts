import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { deploymentURL, validateDeployment, resolveDeployment, resolveSourceRun } from "./deployment-target.mjs";
import { cleanupTables } from "./smoke-cleanup.mjs";

const sha = "a".repeat(40);
const url = "https://ai-holdem-123.vercel.app";
const projectId = "prj_N0tyAlXJcQPz1zO15o2Hbno9RV86";
const repository = "jonime/ai-holdem";
const actor = { login: "vercel[bot]", type: "Bot" };
const env = { GITHUB_EVENT_NAME: "repository_dispatch", PRODUCTION_VERCEL_PROJECT_ID: projectId,
  GITHUB_REPOSITORY: repository, GITHUB_ACTOR: actor.login, GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1" };
const payload = { environment: "production", project: { id: projectId }, state: { type: "success" },
  id: "dpl_example123", url, git: { sha } };
const event = { action: "vercel.deployment.success", repository: { full_name: repository }, sender: actor, client_payload: payload };
const record = { schemaVersion: 1, repository, projectId, environment: "production", state: "success",
  deploymentId: payload.id, url, sha, sourceRunId: "123", sourceRunAttempt: "1" };
const manual = { inputs: { run_id: "123" } };
const manualEnv = { ...env, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_TOKEN: "automatic-github-token",
  SOURCE_RUN_ID: "123", SOURCE_RUN_ATTEMPT: "1" };
const sourceRun = { id: 123, run_attempt: 1, repository: { full_name: repository }, actor,
  event: "repository_dispatch", path: ".github/workflows/production-smoke.yml", head_branch: "main", status: "completed", conclusion: "failure" };

describe("tokenless deployment approval", () => {
  it("accepts Vercel's authenticated production event without any network request or Vercel token", () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must not call Vercel"));
    try {
      expect(resolveDeployment(event, env)).toEqual(record);
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
  it.each([
    { environment: "preview" }, { project: { id: "other" } }, { state: { type: "error" } },
    { git: { sha: "short" } }, { git: { sha: sha + "\n" } }, { id: "" }, { url: "https://example.com" },
  ])("rejects invalid deployment fields %j", change => {
    expect(() => resolveDeployment({ ...event, client_payload: { ...payload, ...change } }, env)).toThrow();
  });
  it("rejects spoofed, missing, unrelated-repository and unexpected dispatch sources", () => {
    for (const change of [{ sender: { login: "attacker", type: "User" } }, { sender: { login: "vercel[bot]", type: "User" } },
      { sender: undefined }, { repository: { full_name: "other/repo" } }, { action: "vercel.deployment.ready" }]) {
      expect(() => resolveDeployment({ ...event, ...change }, env)).toThrow();
    }
    expect(() => resolveDeployment(event, { ...env, GITHUB_ACTOR: "attacker" })).toThrow();
    expect(() => resolveDeployment(event, { ...env, GITHUB_EVENT_NAME: "pull_request" })).toThrow();
    expect(() => resolveDeployment(event, { ...env, GITHUB_RUN_ID: "" })).toThrow();
    expect(() => resolveDeployment(event, { ...env, PRODUCTION_VERCEL_PROJECT_ID: "" })).toThrow();
  });
  it.each(["http://x.vercel.app", "https://example.com", "https://evil.vercel.app.example.org", "https://x.vercel.app/path", "https://x.vercel.app?token=x", "https://user:pass@x.vercel.app", "https://x.vercel.app:444", "https://x.vercel.app#fragment"])("rejects unsafe URL %s", value => {
    expect(() => deploymentURL(value)).toThrow();
  });
  it("stores only allowlisted deployment fields, excluding arbitrary payload data", () => {
    expect(validateDeployment({ ...record, credentials: "never persist" }, { projectId, repository })).toEqual(record);
  });
  it("revalidates the previously approved target and binds it to source run/attempt", () => {
    expect(resolveDeployment(manual, manualEnv, record)).toEqual(record);
    for (const change of [{ repository: "other/repo" }, { projectId: "other" }, { environment: "preview" },
      { schemaVersion: 2 }, { sha: "short" }, { sourceRunId: "456" }, { sourceRunAttempt: "2" }]) {
      expect(() => resolveDeployment(manual, manualEnv, { ...record, ...change })).toThrow();
    }
    expect(() => resolveDeployment(manual, manualEnv)).toThrow();
    expect(() => resolveDeployment({ inputs: { url, sha } }, manualEnv, record)).toThrow();
    expect(() => resolveDeployment(manual, { ...manualEnv, SOURCE_RUN_ID: "456" }, record)).toThrow();
    expect(() => resolveDeployment(manual, { ...manualEnv, SOURCE_RUN_ATTEMPT: "" }, record)).toThrow();
  });
  it("checks manual artifact provenance using only GitHub's automatic token, even for a failed smoke", async () => {
    const network = vi.fn().mockResolvedValue({ ok: true, json: async () => sourceRun });
    await expect(resolveSourceRun(manual, manualEnv, network)).resolves.toEqual({ id: "123", attempt: "1" });
    expect(network).toHaveBeenCalledOnce();
    expect(network.mock.calls[0][0]).toBe(`https://api.github.com/repos/${repository}/actions/runs/123`);
    expect(network.mock.calls[0][1].redirect).toBe("error");
  });
  it.each([
    { id: 456 }, { repository: { full_name: "other/repo" } }, { actor: { login: "attacker", type: "User" } },
    { actor: { login: "vercel[bot]", type: "User" } }, { event: "workflow_dispatch" }, { event: "pull_request" },
    { path: ".github/workflows/other.yml" }, { head_branch: "feature" }, { status: "in_progress" }, { run_attempt: 0 },
  ])("rejects an untrusted manual source run %j", async change => {
    const network = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...sourceRun, ...change }) });
    await expect(resolveSourceRun(manual, manualEnv, network)).rejects.toThrow();
  });
  it("fails closed for unavailable/expired sources and malformed IDs", async () => {
    const network = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(resolveSourceRun(manual, manualEnv, network)).rejects.toThrow("404");
    network.mockClear();
    for (const run_id of ["", "0", "123/../../other", "123?token=x", "-1", "123\n"]) {
      await expect(resolveSourceRun({ inputs: { run_id } }, manualEnv, network)).rejects.toThrow();
    }
    await expect(resolveSourceRun(manual, { ...manualEnv, GITHUB_TOKEN: "" }, network)).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
  });
});

function request(guest = false) {
  const calls: string[] = [];
  let deleted = false;
  return {
    calls,
    get: vi.fn(async (path: string) => {
      calls.push(path);
      return { ok: () => true, status: () => deleted ? 404 : 200, json: async () => ({ game: { version: 5, poker: { players: guest ? [{ seat: 1, controller: "human", playerToken: "owned" }] : [] } } }) };
    }),
    post: vi.fn(async (path: string) => { calls.push(path); if (path.endsWith("/remove")) deleted = true; return { ok: (): boolean => true, status: (): number => 200, json: async () => ({ code: "" }) }; }),
  };
}
it("releases owned guest seats before deleting only ledger tables", async () => {
  const owner = request(); const guest = request(true);
  expect(await cleanupTables([{ id: "created-here", owner, guests: [guest] }])).toEqual([]);
  expect(guest.post).toHaveBeenCalledWith("/api/games/created-here/seats/1/release", { data: { expectedVersion: 5 } });
  expect(owner.post).toHaveBeenCalledWith("/api/games/created-here/remove", { data: { expectedVersion: 5, operation: "delete" } });
  expect(owner.calls.every(path => path.includes("created-here"))).toBe(true);
  expect(await cleanupTables([])).toEqual([]);
});
it("continues deletion and other fixture cleanup after failures", async () => {
  const owner = request(); const guest = request(true);
  guest.post.mockRejectedValue(new Error("must not log raw exception"));
  const badOwner = request(); badOwner.post.mockRejectedValue(new Error("private"));
  const failures = await cleanupTables([{ id: "first", owner, guests: [guest] }, { id: "second", owner: badOwner, guests: [] }]);
  expect(failures).toEqual(["Deletion failed for run table second", "Guest release failed for run table first"]);
  expect(owner.post).toHaveBeenCalled();
});
it("locks deployment selection, fails empty overrides, and starts no local stack", () => {
  for (const arg of ["--pass-with-no-tests", "--grep=missing", "--project=webkit", "--shard=1/2"]) {
    const result = spawnSync(process.execPath, ["scripts/e2e/deployment.mjs", arg], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("overrides are forbidden");
  }
  const runner = readFileSync("scripts/e2e/deployment.mjs", "utf8");
  const config = readFileSync("playwright.deployment.config.ts", "utf8");
  expect(runner).not.toMatch(/production\.mjs|supabase\.mjs|server\.mjs|npm.*build|docker/);
  expect(config).not.toContain("webServer");
  expect(config).toContain("workers: 1"); expect(config).toContain("retries: 0");
});
it("preserves nightly and release browser coverage outside PR CI", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const nightly = readFileSync(".github/workflows/browser-regression.yml", "utf8");
  const production = readFileSync(".github/workflows/production-smoke.yml", "utf8");
  expect(ci).not.toMatch(/browser-rollout|browser-regression\.yml|test:e2e/);
  expect(ci).not.toMatch(/ci-setup|ci-apt|ci-process-verification/);
  for (const command of ["db:types:check", "test:sql", "test:integration:bot-pipeline"]) expect(ci).toContain(command);
  for (const command of ["ci-process-verification.mjs", "ci-apt.mjs", "ci-setup.mjs", "test:e2e:ci", "supabase.mjs stop"]) expect(nightly).toContain(command);
  expect(nightly).toContain("0 3 * * *"); expect(nightly).toContain("inputs.revision || 'main'");
  expect(production).toContain("vercel.deployment.success");
  expect(production).toContain("cancel-in-progress: false"); expect(production).toContain("timeout-minutes: 10");
  expect(production).toContain("ref: ${{ steps.target.outputs.sha }}");
  expect(production).not.toMatch(/supabase\/setup|npm run build|supabase\.mjs|webkit|SUPABASE_SECRET/);
});

it("collects exactly the three deployed journeys without starting a server", () => {
  const result = spawnSync(process.execPath, ["scripts/e2e/deployment.mjs", "--list"], {
    encoding: "utf8",
    env: { ...process.env, PRODUCTION_SMOKE_URL: "https://www.aiholdem.gg", PRODUCTION_SMOKE_SHA: sha },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("Total: 3 tests in 1 file");
  expect(result.stdout).not.toMatch(/webkit|Quick Play/);
});

it("reconciles explicit cleanup version conflicts without retrying unknown outcomes", async () => {
  const owner = request();
  owner.post.mockResolvedValueOnce({ ok: () => false, status: () => 409, json: async () => ({ code: "GAME_CONFLICT" }) });
  expect(await cleanupTables([{ id: "created-here", owner, guests: [] }])).toEqual([]);
  expect(owner.post).toHaveBeenCalledTimes(2);
  const unknown = request(); unknown.post.mockRejectedValue(new Error("network failure"));
  expect(await cleanupTables([{ id: "created-here", owner: unknown, guests: [] }])).toHaveLength(1);
  expect(unknown.post).toHaveBeenCalledTimes(1);
  const blocked = request();
  blocked.post.mockResolvedValue({ ok: () => false, status: () => 409, json: async () => ({ code: "TABLE_DELETION_BLOCKED" }) });
  expect(await cleanupTables([{ id: "created-here", owner: blocked, guests: [] }])).toHaveLength(1);
  expect(blocked.post).toHaveBeenCalledTimes(1);
});

it("uses validated-event artifacts for manual dispatch without Vercel secrets or arbitrary targets", () => {
  const workflow = readFileSync(".github/workflows/production-smoke.yml", "utf8");
  expect(workflow).not.toMatch(/VERCEL_READ_TOKEN|PRODUCTION_VERCEL_TEAM_ID|secrets\./);
  expect(workflow).toContain("github.event.sender.login == 'vercel[bot]'");
  expect(workflow).toContain("actions: read");
  expect(workflow).toContain("node validation/scripts/e2e/validate-deployment.mjs source");
  expect(workflow).toContain("run-id: ${{ steps.source.outputs.run_id }}");
  expect(workflow).toContain("production-smoke-target-${{ steps.source.outputs.attempt }}");
  expect(workflow).toContain("retention-days: 7");
  const inputs = workflow.slice(workflow.indexOf("  workflow_dispatch:"), workflow.indexOf("permissions:"));
  expect(inputs).toContain("run_id:"); expect(inputs).not.toMatch(/url:|sha:/);
});

it("persists an allowlisted target and replays it through the real manual validation entrypoint", () => {
  const directory = mkdtempSync(join(tmpdir(), "smoke-target-"));
  const script = resolve("scripts/e2e/validate-deployment.mjs");
  const paths = { GITHUB_EVENT_PATH: join(directory, "event.json"), GITHUB_OUTPUT: join(directory, "output"), GITHUB_STEP_SUMMARY: join(directory, "summary") };
  try {
    writeFileSync(paths.GITHUB_EVENT_PATH, JSON.stringify({ ...event, client_payload: { ...payload, privateKey: "never-persist" } }));
    const automatic = spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8", env: { ...process.env, ...env, ...paths, GITHUB_TOKEN: "" }, timeout: 5000 });
    expect(automatic.status, automatic.stderr).toBe(0);
    const saved = readFileSync(join(directory, "validated-production-target/target.json"), "utf8");
    expect(JSON.parse(saved)).toEqual(record); expect(saved).not.toContain("never-persist");
    mkdirSync(join(directory, "production-smoke-target"));
    const targetFile = join(directory, "production-smoke-target/target.json");
    writeFileSync(targetFile, saved);
    writeFileSync(paths.GITHUB_EVENT_PATH, JSON.stringify(manual));
    const replay = () => spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8", env: { ...process.env, ...manualEnv, ...paths }, timeout: 5000 });
    const result = replay(); expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(paths.GITHUB_STEP_SUMMARY, "utf8")).toContain("Validated source run: 123 (attempt 1)");
    const previousOutput = readFileSync(paths.GITHUB_OUTPUT, "utf8");
    writeFileSync(targetFile, JSON.stringify({ ...record, sourceRunAttempt: "2" }));
    expect(replay().status).not.toBe(0);
    expect(readFileSync(paths.GITHUB_OUTPUT, "utf8")).toBe(previousOutput);
    rmSync(targetFile);
    expect(replay().status).not.toBe(0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("runs preflight before installation and executes trusted guards with the fixed public origin", () => {
  const workflow = readFileSync(".github/workflows/production-smoke.yml", "utf8");
  expect(workflow.indexOf("smoke-release.mjs preflight")).toBeLessThan(workflow.indexOf("run: npm ci"));
  expect(workflow).toContain("run: node ../validation/scripts/e2e/deployment.mjs");
  expect(workflow).toContain("PRODUCTION_SMOKE_URL: https://www.aiholdem.gg");
  expect(workflow).not.toContain("PRODUCTION_SMOKE_URL: ${{ steps.target.outputs.url }}");
  const runner = readFileSync("scripts/e2e/deployment.mjs", "utf8");
  for (const path of ["test/deployment/fixtures.ts", "test/deployment/journeys.spec.ts", "scripts/e2e/production-revision.mjs"]) expect(runner).toContain(path);
  expect(readFileSync("playwright.deployment.config.ts", "utf8")).toContain("maxFailures: 1");
  const fixture = readFileSync("test/deployment/fixtures.ts", "utf8");
  expect(fixture).toContain("browser.newContext({ baseURL: publicOrigin(info.project.use.baseURL) })");
  expect(fixture).not.toMatch(/storageState:|cookies:|extraHTTPHeaders:/);
  expect(fixture).toContain("table.guests.push(context.request)");
  expect(fixture).toContain("owner: page.request");
});

it("never reports passing release evidence after a revision change, and distinguishes cleanup failures", () => {
  const directory = mkdtempSync(join(tmpdir(), "smoke-report-"));
  const script = resolve("scripts/e2e/smoke-release.mjs");
  try {
    for (let index = 0; index < 3; index++) {
      const path = join(directory, "smoke-diagnostics", String(index));
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, "journey-summary.txt"), "Journey: passed\nCleanup: passed\n");
    }
    const log = join(directory, "revision.jsonl");
    writeFileSync(log, JSON.stringify({ expected: sha, observed: sha, category: "verified" }) + "\n");
    const report = () => {
      const result = spawnSync(process.execPath, [script, "report"], { cwd: directory, encoding: "utf8", env: {
        ...process.env, GITHUB_STEP_SUMMARY: "", PRODUCTION_SMOKE_SHA: sha, PRODUCTION_SMOKE_DEPLOYMENT_URL: url,
        PRODUCTION_SMOKE_REVISION_LOG: log, SMOKE_OUTCOME: "success", PREFLIGHT_OUTCOME: "success",
      } });
      expect(result.status, result.stderr).toBe(0);
      return readFileSync(join(directory, "smoke-diagnostics/summary.txt"), "utf8");
    };
    expect(report()).toContain("passed (three journeys; owned tables removed)");
    writeFileSync(log, JSON.stringify({ expected: sha, observed: "b".repeat(40), category: "revision mismatch" }) + "\n");
    const summary = report();
    expect(summary).toContain("release not verified: production revision mismatch");
    expect(summary).not.toContain("Production smoke: passed");
    expect(summary).toContain("Cleanup: all three owned tables removed");
    expect(summary).toContain(`Original deployment URL: ${url}`);
    expect(summary).toContain("Public test origin: https://www.aiholdem.gg");
    writeFileSync(join(directory, "smoke-diagnostics/0/journey-summary.txt"), "Journey: failed\nCleanup: failed\n");
    expect(report()).toContain("Cleanup: failed; see cleanup-summary.txt");
    expect(report()).toContain("Journey failures: yes");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
