import { expect,it } from "vitest";
import { BotProviderError,botProviderFailureReason } from "./types";
it("reports only fixed provider reasons or validated HTTP status without exposing messages", () => {
  expect(botProviderFailureReason(new BotProviderError("LLM provider selected sizing for a passive action"))).toBe("passive_sizing");
  expect(botProviderFailureReason(new BotProviderError("LLM provider request failed with HTTP 400"))).toBe("http_400");
  expect(botProviderFailureReason(new BotProviderError("secret provider body api-key"))).toBe("unknown");
});
