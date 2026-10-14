import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { botPipelineEnvironment } from "./bot-pipeline-environment.mjs";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
function status(origin: string) {
  vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ API_URL: origin, ANON_KEY: "local-anon", SERVICE_ROLE_KEY: "local-service" }));
}
describe("isolated bot pipeline environment", () => {
  it("allowlists process settings and uses only local credentials", () => {
    status("http://127.0.0.1:54321");
    const env = botPipelineEnvironment({ PATH: "/bin", NODE_OPTIONS: "--env-file=.env", TYPESAFE_API_KEY: "secret", LLM_API_KEY: "secret", OPENAI_API_KEY: "secret", NEXT_PUBLIC_SUPABASE_URL: "https://hosted.example", LLM_BOT_MODELS: "hosted" });
    expect(env).toMatchObject({ PATH: "/bin", SUPABASE_SECRET_KEY: "local-service", NODE_ENV: "test", EXTERNAL_INFERENCE_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" });
    for (const key of ["NODE_OPTIONS", "TYPESAFE_API_KEY", "LLM_API_KEY", "LLM_API_ENDPOINT", "OPENAI_API_KEY"]) expect(env).not.toHaveProperty(key);
    expect(env.USAGE_LIMIT_HASH_SECRET.length).toBeGreaterThanOrEqual(64);
    expect(JSON.parse(env.LLM_BOT_MODELS)[0].id).toBe("llm-test-model");
  });
  it.each(["https://project.supabase.co", "http://localhost.attacker.test", "http://user@localhost:54321", "http://localhost:54321/path", "http://localhost:54321/?secret=x", "invalid"])("rejects destination before launch: %s", origin => {
    status(origin);
    expect(() => botPipelineEnvironment({})).toThrow("loopback");
  });
});
