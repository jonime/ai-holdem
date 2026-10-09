import { expect, it } from "vitest";
import { HttpError } from "@/lib/http/api";
import { botFailureCodes } from "@/lib/http/gameplay-contracts";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { getGameDictionary } from "@/lib/i18n/server";
import { botErrorMessage } from "./bot-error";

it.each(SUPPORTED_LOCALES)("maps every failure to server-owned %s messages", async locale => {
  const dictionary = await getGameDictionary(locale);
  const keys = ["botTimeout", "botNetwork", "botRateLimited", "botInvalidResponse", "botProvider"] as const;
  Object.values(botFailureCodes).forEach((code, index) => {
    const t = (key: string) => dictionary.errors[key.slice(7) as keyof typeof dictionary.errors];
    expect(botErrorMessage(new HttpError("AI decision failed", 502, code), t)).toBe(dictionary.errors[keys[index]]);
    // CJK messages convey the same guidance with fewer characters.
    const minimumLength = locale === "ja-JP" || locale === "zh-Hans" ? 15 : 30;
    const message = dictionary.errors[keys[index]];
    expect(message.length).toBeGreaterThan(minimumLength);
    if (locale === "ja-JP") {
      expect(message).toContain("一時停止");
      expect(message).toContain("再試行");
    }
    if (locale === "zh-Hans") {
      expect(message).toContain("暂停");
      expect(message).toContain("重试");
    }
  });
});

it("retains uncoded and unknown-code fallback errors", () => {
  expect(botErrorMessage(new HttpError("AI decision failed", 502), key => key)).toBe("AI decision failed");
  expect(botErrorMessage(new HttpError("Safe fallback", 502, "UNKNOWN"), key => key)).toBe("Safe fallback");
  expect(botErrorMessage(null, key => key)).toBe("errors.advanceAi");
});
