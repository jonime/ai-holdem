import { afterEach, describe, expect, it, vi } from "vitest";

import { getBotCatalog, ServerBotRegistry } from "./registry";

afterEach(() => vi.unstubAllEnvs());

describe("bot registry", () => {
  it("exposes and resolves exactly one rules option", () => {
    const catalog = getBotCatalog();
    const rulesBots = catalog.filter((bot) => bot.provider === "rules");

    expect(rulesBots).toHaveLength(1);
    expect(rulesBots[0]).toMatchObject({
      id: "equity-rules-v2",
      label: "Equity Rules",
      provider: "rules",
    });
    expect(
      new ServerBotRegistry().get({ botId: "equity-rules-v2" }).descriptor,
    ).toMatchObject({
      id: "equity-rules-v2",
      label: "Equity Rules",
      provider: "rules",
    });
    expect(() =>
      new ServerBotRegistry().get({ botId: "basic-equity-v1" }),
    ).toThrow("Unknown bot: basic-equity-v1");
    expect(() => new ServerBotRegistry().get({ botId: "missing-bot" })).toThrow();
  });

  it("passes a configured reasoning effort to an LLM bot", () => {
    vi.stubEnv(
      "LLM_BOT_MODELS",
      JSON.stringify([
        {
          id: "configured-llm",
          label: "Configured LLM",
          modelId: "vendor/model",
          reasoning: "high",
        },
      ]),
    );

    const resolved = new ServerBotRegistry().get({ botId: "configured-llm" });

    expect(resolved.descriptor).toMatchObject({
      id: "configured-llm",
      modelId: "vendor/model",
      provider: "llm",
    });
    expect(resolved.bot).toMatchObject({ reasoning: "high" });
  });
});
