import { execFileSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import { networkPreflight } from "./network-preflight";

it("checks only provider origins using credential-free HEAD requests", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
  await networkPreflight(fetcher);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["https://api.typesafe.ai", "https://openrouter.ai"]);
  for (const [, init] of fetcher.mock.calls) {
    expect(init?.method).toBe("HEAD"); expect(init?.headers).toBeUndefined(); expect(init?.body).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
});
it.each([429, 500, 503])("stops preflight on status %i", async status => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status }));
  await expect(networkPreflight(fetcher)).rejects.toThrow("no inference started");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("loads the actual live branch in Node 24 and stops before ledger/inference", () => {
  const script = `
    globalThis.fetch = async (_url, init) => {
      if (init?.method !== 'HEAD' || init.headers || init.body) throw new Error('Inference forbidden');
      return new Response(null, {status: 503});
    };
    process.argv[2] = 'live';
    try { await import('./benchmarks/bet-sizing/run.mjs'); throw new Error('Unexpected success'); }
    catch (error) {
      if (error.message !== 'Provider connectivity preflight unavailable; no inference started') throw error;
      console.log('Live startup reached safe HEAD preflight; no inference');
    }
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 60000,
    env: { ...process.env, BET_SIZING_AUTHORIZATION: "authorize-new-960-bet-sizing-v1", BOT_SCENARIO_LIVE: "true", EXTERNAL_INFERENCE_ENABLED: "true", BOT_DECISION_CALL_CAP: "1000", TYPESAFE_API_KEY: "scripted-startup-jev", LLM_API_KEY: "scripted-startup-llm", LLM_API_ENDPOINT: "https://openrouter.ai/api/v1/chat/completions" } });
  expect(output).toContain("Live startup reached safe HEAD preflight; no inference");
}, 60000);
