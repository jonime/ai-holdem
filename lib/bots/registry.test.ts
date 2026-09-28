import { describe, expect, it } from "vitest";

import { getBotCatalog, ServerBotRegistry } from "./registry";

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
});
