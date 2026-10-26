import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { deploymentURL, validateDeployment, resolveDeployment } from "./deployment-target.mjs";
import { cleanupTables } from "./smoke-cleanup.mjs";

const sha = "a".repeat(40);
const url = "https://ai-holdem-123.vercel.app";
const projectId = "prj_N0tyAlXJcQPz1zO15o2Hbno9RV86";
const deployment = { projectId, target: "production", readyState: "READY", url: new URL(url).hostname,
  meta: { githubCommitSha: sha, githubCommitOrg: "jonime", githubCommitRepo: "ai-holdem" } };
const approved = { projectId, url, repository: "jonime/ai-holdem", sha };
const env = { GITHUB_EVENT_NAME: "repository_dispatch", PRODUCTION_VERCEL_PROJECT_ID: projectId,
  VERCEL_READ_TOKEN: "test-only", GITHUB_REPOSITORY: approved.repository };
const event = { action: "vercel.deployment.success", client_payload: { environment: "production", project: { id: projectId }, state: { type: "success" }, url, git: { sha } } };

describe("deployment approval", () => {
  it("validates authoritative metadata and manual/event revision", async () => {
    expect(validateDeployment(deployment, approved)).toEqual({ url, sha });
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => deployment });
    await expect(resolveDeployment(event, env, request)).resolves.toEqual({ url, sha });
    await expect(resolveDeployment({ inputs: { url, sha } }, { ...env, GITHUB_EVENT_NAME: "workflow_dispatch" }, request)).resolves.toEqual({ url, sha });
    expect(request.mock.calls[0][0].origin).toBe("https://api.vercel.com");
  });
  it.each([
    { target: null }, { target: "preview" }, { projectId: "other" }, { readyState: "ERROR" },
    { url: "other.vercel.app" }, { meta: { ...deployment.meta, githubCommitSha: "b".repeat(40) } },
    { meta: { ...deployment.meta, githubCommitRepo: "other" } }, { meta: {} },
  ])("rejects invalid metadata %j", change => {
    expect(() => validateDeployment({ ...deployment, ...change }, approved)).toThrow();
  });
  it.each(["http://x.vercel.app", "https://example.com", "https://evil.vercel.app.example.org", "https://x.vercel.app/path", "https://x.vercel.app?token=x", "https://user:pass@x.vercel.app", "https://x.vercel.app:444", "https://x.vercel.app#fragment"])("rejects unsafe URL %s", value => {
    expect(() => deploymentURL(value)).toThrow();
  });
  it("rejects preview/unrelated events before network access and rejects missing/manual mismatched revisions", async () => {
    const request = vi.fn();
    for (const change of [{ environment: "preview" }, { project: { id: "other" } }, { git: {} }, { state: { type: "error" } }]) {
      await expect(resolveDeployment({ ...event, client_payload: { ...event.client_payload, ...change } }, env, request)).rejects.toThrow();
    }
    expect(request).not.toHaveBeenCalled();
    await expect(resolveDeployment({ inputs: { url } }, { ...env, GITHUB_EVENT_NAME: "workflow_dispatch" }, request)).rejects.toThrow();
    request.mockResolvedValue({ ok: true, json: async () => deployment });
    await expect(resolveDeployment({ inputs: { url, sha: "b".repeat(40) } }, { ...env, GITHUB_EVENT_NAME: "workflow_dispatch" }, request)).rejects.toThrow();
    request.mockResolvedValue({ ok: false, status: 403 });
    await expect(resolveDeployment(event, env, request)).rejects.toThrow("403");
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
it("preserves full regression selection and rollout gating without PR browser setup", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const nightly = readFileSync(".github/workflows/browser-regression.yml", "utf8");
  const production = readFileSync(".github/workflows/production-smoke.yml", "utf8");
  expect(ci).toContain("PR_BROWSER_ROLLOUT_COMPLETE != 'true'");
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
    env: { ...process.env, PRODUCTION_SMOKE_URL: url, PRODUCTION_SMOKE_SHA: sha },
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
