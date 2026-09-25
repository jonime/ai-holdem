import { describe, expect, it } from "vitest";

import { BasicEquityBot } from "./basic-equity";
import { getBotCatalog, ServerBotRegistry } from "./registry";

describe("bot registry", () => {
  it("exposes exactly one rules option and resolves legacy IDs", () => {
    const catalog = getBotCatalog();
    const rulesBots = catalog.filter((bot) => bot.provider === "rules");

    expect(rulesBots).toHaveLength(1);
    expect(rulesBots[0]).toMatchObject({
      id: "equity-rules-v2",
      label: "Equity Rules",
      provider: "rules",
    });
    expect(
      new ServerBotRegistry().get("equity-rules-v2").descriptor,
    ).toMatchObject({
      id: "equity-rules-v2",
      label: "Equity Rules",
      provider: "rules",
    });
    expect(new ServerBotRegistry().get("basic-equity-v1").bot).toBeInstanceOf(
      BasicEquityBot,
    );
    expect(() => new ServerBotRegistry().get("missing-bot")).toThrow();
  });
});
