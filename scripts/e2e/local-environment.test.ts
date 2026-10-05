import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { localEnvironment, rejectCIOverride } from "./local-environment.mjs";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("GITHUB_ACTIONS", "");
  vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ API_URL: "http://127.0.0.1:54321", ANON_KEY: "local-anon", SERVICE_ROLE_KEY: "local-secret" }));
});

describe("local smoke environment boundary", () => {
  it("replaces inherited hosted settings and disables inference", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://hosted.example");
    vi.stubEnv("TYPESAFE_API_KEY", "hosted-key");
    vi.stubEnv("LLM_API_KEY", "hosted-key");
    const env = localEnvironment();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(env.SUPABASE_SECRET_KEY).toBe("local-secret");
    expect(env.EXTERNAL_INFERENCE_ENABLED).toBe("false");
    expect(env.TYPESAFE_API_KEY).toBe("");
    expect(env.LLM_API_KEY).toBe("");
    expect(env.LLM_API_ENDPOINT).toBe("");
  });
  it.each(["https://project.supabase.co", "http://localhost.attacker.test", "http://secret@localhost:54321", "http://localhost:54321/other", "http://localhost:54321/?secret=yes"])("rejects unsafe origin %s", origin => {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ API_URL: origin, ANON_KEY: "anon", SERVICE_ROLE_KEY: "secret" }));
    expect(() => localEnvironment()).toThrow("loopback");
  });
  it("does not expose status errors containing credentials", () => {
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error("sensitive status dump"); });
    expect(() => localEnvironment()).toThrow("Local Supabase status failed");
  });
  it("rejects preview overrides in CI", () => {
    vi.stubEnv("CI", "true");
    vi.stubEnv("E2E_BASE_URL", "https://preview.example");
    expect(() => rejectCIOverride()).toThrow("forbidden in CI");
    vi.stubEnv("CI", "");
    expect(() => rejectCIOverride()).not.toThrow();
  });
});
