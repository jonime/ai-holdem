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

 describe("Eevo availability", () => {
  it.each([ ["", "true", false], ["configured", "false", false], ["configured", "true", true] ])("key %s and inference %s => %s", (key, inference, available) => {
    vi.stubEnv("EEVO_API_KEY", key);
    vi.stubEnv("EXTERNAL_INFERENCE_ENABLED", inference);
    expect(getBotCatalog().some(bot => bot.id === "eevo")).toBe(available);
    const registry = new ServerBotRegistry();
    expect(registry.get({ botId: "eevo" }).descriptor).toMatchObject({ provider: "eevo", modelId: "eevo-1", configuration: { difficulty: true, playstyle: false } });
    expect(() => registry.get({ botId: "eevo", profileId: "tight" })).toThrow("only supported by LLM");
  });
});
