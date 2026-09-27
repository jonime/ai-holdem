import { describe, expect, it } from "vitest";

import {
  DEFAULT_BOT_PLAYSTYLE_ID,
  isBotPlaystyleId,
  LLM_PLAYSTYLES,
} from "./llm-playstyles";

describe("LLM bot playstyles", () => {
  it("has an exhaustive trusted registry and a balanced default", () => {
    expect(DEFAULT_BOT_PLAYSTYLE_ID).toBe("balanced");
    expect(Object.keys(LLM_PLAYSTYLES)).toEqual([
      "balanced",
      "tight",
      "aggressive",
    ]);
    expect(isBotPlaystyleId("aggressive")).toBe(true);
    expect(isBotPlaystyleId("invented prompt")).toBe(false);
  });
});
