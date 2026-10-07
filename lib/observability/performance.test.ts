import { describe, expect, it } from "vitest";

import { redactPerformanceEvent } from "./performance";

describe("performance event privacy", () => {
  it("redacts private table links, queries, fragments, and incoming routes", () => {
    expect(redactPerformanceEvent({
      type: "vital",
      url: "https://www.aiholdem.gg/fi-FI/game/private-table?token=secret#cards",
      route: "/fi-FI/game/private-table",
    })).toEqual({
      type: "vital",
      url: "https://www.aiholdem.gg/fi-FI/game/[gameId]",
      route: "/[lang]/game/[gameId]",
    });
  });

  it.each(["", "/about", "/developers", "/join-game"])("retains public page %s without query data", (suffix) => {
    expect(redactPerformanceEvent({
      type: "vital",
      url: `https://www.aiholdem.gg/en-US${suffix}?name=private`,
    })).toEqual({
      type: "vital",
      url: `https://www.aiholdem.gg/en-US${suffix}`,
      route: `/[lang]${suffix}`,
    });
  });

  it("redacts English table URLs at the root", () => {
    expect(redactPerformanceEvent({ type: "vital", url: "https://www.aiholdem.gg/game/private-table?token=secret#cards", route: "/game/private-table" })).toEqual({ type: "vital", url: "https://www.aiholdem.gg/game/[gameId]", route: "/game/[gameId]" });
  });

  it.each(["/", "/about", "/developers", "/play"])("retains English page %s without query data", path => {
    expect(redactPerformanceEvent({ type: "vital", url: `https://www.aiholdem.gg${path}?name=private` })).toEqual({ type: "vital", url: `https://www.aiholdem.gg${path}`, route: path });
  });

  it.each(["invalid", "https://www.aiholdem.gg/private-value", "https://www.aiholdem.gg/api/games/private-table", "https://www.aiholdem.gg/en-US/unknown/private", "file:///en-US"])("drops unsupported URL %s", (url) => {
    expect(redactPerformanceEvent({ type: "vital", url })).toBeNull();
  });
});
