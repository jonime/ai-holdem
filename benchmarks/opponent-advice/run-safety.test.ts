import { expect, it } from "vitest";
import { BotProviderError } from "@/lib/bots/types";
import { cappedBot, buildPreflopNode, preflopNodes } from "../poker-context-harness";
import { networkPreflight, stopAfterFailure } from "./run-safety";

it("checks connectivity without credentials or inference payloads", async () => {
  const requests: RequestInit[] = [];
  await networkPreflight(async (_url, init) => { requests.push(init!); return new Response(null, { status: 404 }); });
  expect(requests).toHaveLength(2);
  for (const request of requests) { expect(request.method).toBe("HEAD"); expect(request.body).toBeUndefined(); expect(request.headers).toBeUndefined(); }
  await expect(networkPreflight(async () => { throw new Error("offline"); })).rejects.toThrow("no inference started");
  await expect(networkPreflight(async () => new Response(null, { status: 429 }))).rejects.toThrow("no inference started");
});
it("stops every provider/policy after one failure and preserves the remaining budget", async () => {
  const budget = { remaining: 960 }; let requests = 0;
  const failing = cappedBot({ async decide() { requests++; throw new BotProviderError("network", undefined, { category: "network" }); } }, budget);
  const guarded = stopAfterFailure({ jev: { current: failing, advice: failing }, mini: { current: failing, advice: failing } });
  const context = buildPreflopNode(preflopNodes[0], ["As", "Ks"], "facts", 5).context;
  await expect(guarded.bots.jev.current.decide(context)).rejects.toThrow("network");
  await expect(guarded.bots.mini.advice.decide(context)).rejects.toThrow("Decision-call cap exhausted");
  await expect(guarded.bots.jev.advice.decide(context)).rejects.toThrow("Decision-call cap exhausted");
  expect(guarded.failure()).toBe("network"); expect(requests).toBe(1); expect(budget.remaining).toBe(959);
});
