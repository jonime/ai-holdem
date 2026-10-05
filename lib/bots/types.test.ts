import { expect,it } from "vitest";
import { BotProviderError,botProviderFailureReason } from "./types";
it("reports only fixed provider reasons or validated HTTP status without exposing messages", () => {
  expect(botProviderFailureReason(new BotProviderError("private text", undefined, { category: "invalid_response" }))).toBe("invalid_response");
  expect(botProviderFailureReason(new BotProviderError("private text", { httpStatus: 400, providerErrorCode: null, retryAfterSeconds: null, retryAfterPresent: false, creditMentioned: false, quotaMentioned: false, rateLimitMentioned: false, limitSource: null }))).toBe("http_400");
  expect(botProviderFailureReason(new BotProviderError("secret provider body api-key"))).toBe("unknown");
});
