import { afterEach, describe, expect, it, vi } from "vitest";

import type { BotContext } from "./types";
import { LlmPokerBot } from "./llm";

const context = {
  difficulty: "medium",
  game: {
    variant: "no_limit_texas_holdem",
    smallBlind: 1,
    bigBlind: 2,
    handNumber: 1,
  },
  hand: { street: "preflop", pot: 3, communityCards: [] },
  hero: {
    seat: 0,
    controller: "bot",
    holeCards: ["As", "Ks"],
    position: "button",
    stack: 100,
    investedThisStreet: 1,
    amountToCall: 1,
    handStrength: {
      madeHand: null,
      bestFive: [],
      usesHoleCards: false,
      draws: { flushDraw: false, straightCompletionRanks: [] },
    },
  },
  opponents: [],
  analysis: {
    showdownEquity: 0.6,
    equityBasis: "random_opponent_hands",
    equitySamples: 100,
    callCost: 1,
    contestablePotAfterCall: 4,
    potOddsToCall: 0.25,
    effectiveStack: 100,
    stackToPotRatio: 33,
  },
  actionHistory: [],
  legalActions: [{ type: "fold" }, { type: "call", amount: 1 }],
  sizingOptions: [
    { choice: "not_applicable", amount: null, description: "none" },
  ],
} satisfies BotContext;

describe("LlmPokerBot", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("parses schema-constrained output and records provider diagnostics", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    vi.stubEnv("LLM_API_ENDPOINT", "https://llm.example.test/chat/completions");
    vi.stubEnv("LLM_API_KEY", "key");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ action: "call", sizing: null }),
                reasoning_details: [{ type: "reasoning.encrypted" }],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.001 },
        }),
        { status: 200 },
      ),
    );
    const decision = await new LlmPokerBot(
      "vendor/model",
      { reasoning: "high" },
      fetcher,
    ).decide(context);
    expect(decision.action).toEqual({ type: "call", amount: 1 });
    expect(decision.diagnostics).toMatchObject({
      promptVersion: "llm-poker-v3.1-guided-balanced",
      botProfileId: "balanced",
      cost: 0.001,
    });
    expect(decision.rawResponse).toEqual({
      choices: [
        {
          message: {
            content: JSON.stringify({ action: "call", sizing: null }),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 2, cost: 0.001 },
    });
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(request.reasoning).toEqual({ effort: "high" });
    expect(request.messages[0].content).toContain(
      "Use only the supplied information",
    );
    expect(request.messages[0].content).toContain("Playstyle preference:");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "https://llm.example.test/chat/completions",
      expect.any(Object),
    );
  });

  it.each(["balanced", "tight", "aggressive"] as const)(
    "uses the trusted %s playstyle in the system policy",
    async (profileId) => {
      vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
      vi.stubEnv("LLM_API_ENDPOINT", "https://llm.example.test/chat/completions");
      vi.stubEnv("LLM_API_KEY", "key");
      const fetcher = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: '{"action":"call","sizing":null}' } },
            ],
          }),
          { status: 200 },
        ),
      );

      const decision = await new LlmPokerBot(
        "vendor/model",
        profileId,
        fetcher,
      ).decide(context);
      const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));

      expect(request.messages[0].role).toBe("system");
      expect(request.messages[0].content).toContain("Playstyle preference:");
      expect(request.messages[1].role).toBe("user");
      expect(JSON.parse(request.messages[1].content)).toMatchObject({
        hero: context.hero,
        legalActions: context.legalActions,
        analysis: { callCost: 1, potOddsToCall: 0.25 },
      });
      expect(decision.diagnostics).toMatchObject({
        promptVersion: `llm-poker-v3.1-guided-${profileId}`,
        botProfileId: profileId,
      });
    },
  );

  it("enforces the external-inference guard before making HTTP requests", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "false");
    vi.stubEnv("LLM_API_ENDPOINT", "https://llm.example.test/chat/completions");
    vi.stubEnv("LLM_API_KEY", "inherited-key-must-not-be-used");
    const fetcher = vi.fn();
    await expect(
      new LlmPokerBot("vendor/model", fetcher).decide(context),
    ).rejects.toThrow("LLM provider request failed");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects invalid or illegal output locally", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    vi.stubEnv("LLM_API_ENDPOINT", "https://llm.example.test/chat/completions");
    vi.stubEnv("LLM_API_KEY", "key");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: '{"action":"raise","sizing":null}' } },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(
      new LlmPokerBot("vendor/model", fetcher).decide(context),
    ).rejects.toThrow("illegal action");
  });

  it("carries safe HTTP failure diagnostics to the route without the raw error body", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    vi.stubEnv("LLM_API_ENDPOINT", "https://llm.example.test/chat/completions");
    vi.stubEnv("LLM_API_KEY", "key");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 402, message: "Insufficient credits secret-key", metadata: { raw: "As Ks" } },
    }), { status: 402 }));
    const error = await new LlmPokerBot("vendor/model", fetcher).decide(context).catch(error => error);
    expect(error).toMatchObject({
      message: "LLM provider request failed with HTTP 402",
      httpFailure: { httpStatus: 402, providerErrorCode: 402, creditMentioned: true },
    });
    expect(JSON.stringify(error)).not.toMatch(/secret-key|As Ks/);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("recognizes provider error envelopes even with HTTP 200", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", "true");
    vi.stubEnv("LLM_API_ENDPOINT", "https://llm.example.test/chat/completions");
    vi.stubEnv("LLM_API_KEY", "key");
    const bot = new LlmPokerBot("vendor/model", async () => new Response(JSON.stringify({
      error: { code: 402, message: "Insufficient credits" },
    })));
    await expect(bot.decide(context)).rejects.toMatchObject({
      httpFailure: { httpStatus: 200, providerErrorCode: 402 },
    });
  });
});

describe("LLM supplied analysis audit and strict output", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("records independently versioned facts and guidance without changing request count", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED","true"); vi.stubEnv("LLM_API_ENDPOINT","https://offline.invalid"); vi.stubEnv("LLM_API_KEY","offline");
    const fetcher=vi.fn<(url:string,init:RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ choices:[{ message:{ content:'{"action":"call","sizing":null}' } }] })));
    const result=await new LlmPokerBot("mock","tight",fetcher).decide(context);
    expect(result.suppliedContext).toMatchObject({ facts:{ version:"poker-facts-v1" },strategyAdvice:{ version:"poker-advice-v1",scope:"general" } });
    const request=JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const payload=JSON.parse(request.messages[1].content);
    expect(payload.facts.startingHand.notation).toBe("AKs");
    expect(request.messages[0].content).toContain("poker-advice-v1");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each(['{"action":"call","sizing":"all_in"}','{"action":"call","sizing":null,"extra":true}','{"action":"call"}'])("rejects invalid local output %s", async content => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED","true"); vi.stubEnv("LLM_API_ENDPOINT","https://offline.invalid"); vi.stubEnv("LLM_API_KEY","offline");
    await expect(new LlmPokerBot("mock",async () => new Response(JSON.stringify({ choices:[{ message:{ content } }] }))).decide(context)).rejects.toThrow();
  });
});

describe("LLM action and sizing schema agreement", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("forces null sizing when only passive actions are available", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED","true"); vi.stubEnv("LLM_API_ENDPOINT","https://offline.invalid"); vi.stubEnv("LLM_API_KEY","offline");
    const fetcher=vi.fn(async (_url:string,init:RequestInit) => {
      void _url;
      const request=JSON.parse(String(init.body));
      expect(request.response_format.json_schema.schema.properties.sizing).toMatchObject({ type:"null",enum:[null] });
      expect(request.messages[0].content).toContain("For fold, check, or call, sizing must be null");
      return new Response(JSON.stringify({ choices:[{ message:{ content:'{"action":"call","sizing":null}' } }] }));
    });
    expect((await new LlmPokerBot("mock",fetcher).decide(context)).action).toEqual({ type:"call",amount:1 });
  });
  it("advertises concrete sizes and null, with explicit passive-action instructions", async () => {
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED","true"); vi.stubEnv("LLM_API_ENDPOINT","https://offline.invalid"); vi.stubEnv("LLM_API_KEY","offline");
    const fetcher=vi.fn(async (_url:string,init:RequestInit) => {
      void _url;
      const request=JSON.parse(String(init.body));
      const sizing=request.response_format.json_schema.schema.properties.sizing;
      expect(sizing.type).toEqual(["string","null"]);
      expect(sizing.enum).not.toContain("not_applicable");
      expect(sizing.enum).toContain(null);
      expect(sizing.description).toContain("Null for fold, check, or call");
      return new Response(JSON.stringify({ choices:[{ message:{ content:'{"action":"call","sizing":null}' } }] }));
    });
    await new LlmPokerBot("mock",fetcher).decide({ ...context,legalActions:[...context.legalActions,{ type:"raise",minAmount:4,maxAmount:101 }] });
  });
});
