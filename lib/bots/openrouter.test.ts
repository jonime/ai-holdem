import { afterEach, describe, expect, it, vi } from "vitest";

import type { BotContext } from "./types";
import { OpenRouterPokerBot } from "./openrouter";

const context = {
  difficulty: "medium",
  game: { variant: "no_limit_texas_holdem", smallBlind: 1, bigBlind: 2, handNumber: 1 },
  hand: { street: "preflop", pot: 3, communityCards: [] },
  hero: { holeCards: ["As", "Ks"], position: "button", stack: 100, investedThisStreet: 1, amountToCall: 1 },
  opponents: [],
  analysis: { showdownEquity: 0.6, equitySamples: 100, potOddsToCall: 0.25, effectiveStack: 100, stackToPotRatio: 33 },
  actionHistory: [],
  legalActions: [{ type: "fold" }, { type: "call", amount: 1 }],
  sizingOptions: [{ choice: "not_applicable", amount: null, description: "none" }],
} satisfies BotContext;

describe("OpenRouterPokerBot", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("parses schema-constrained output and records provider diagnostics", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    vi.stubEnv("OPENROUTER_API_KEY", "key");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ action: "call", sizing: null }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.001 },
        }),
        { status: 200 },
      ),
    );
    const decision = await new OpenRouterPokerBot("vendor/model", fetcher).decide(context);
    expect(decision.action).toEqual({ type: "call", amount: 1 });
    expect(decision.diagnostics).toMatchObject({
      promptVersion: "openrouter-poker-v1",
      cost: 0.001,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("enforces the external-inference guard before making HTTP requests", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "false");
    vi.stubEnv("OPENROUTER_API_KEY", "inherited-key-must-not-be-used");
    const fetcher = vi.fn();
    await expect(new OpenRouterPokerBot("vendor/model", fetcher).decide(context))
      .rejects.toThrow("OpenRouter request failed");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects invalid or illegal output locally", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    vi.stubEnv("OPENROUTER_API_KEY", "key");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"action":"raise","sizing":null}' } }] }),
        { status: 200 },
      ),
    );
    await expect(new OpenRouterPokerBot("vendor/model", fetcher).decide(context))
      .rejects.toThrow("illegal action");
  });
});
