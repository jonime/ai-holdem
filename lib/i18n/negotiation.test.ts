import { describe, expect, it } from "vitest";

import { negotiateLocale } from "./negotiation";

describe("browser locale negotiation", () => {
  it.each([
    ["fi-FI,fi;q=0.9,en;q=0.8", "fi-FI"],
    ["fi", "fi-FI"],
    ["en-GB", "en-US"],
    ["pt-PT", "pt-BR"],
    ["FR-fr", "fr-FR"],
    ["de;q=0.4,sv;q=0.9", "sv-SE"],
    ["pl;q=0.8,nl;q=0.8", "pl-PL"],
    ["ja", "ja-JP"],
    ["zh-CN", "zh-Hans"],
    ["zh-Hans", "zh-Hans"],
    ["ja-JP,es;q=0.5", "ja-JP"],
    ["fi;q=0,de;q=0.5", "de-DE"],
    ["fi;q=2,de;q=0.5", "de-DE"],
    ["fi;q=NaN,de;q=0.5", "de-DE"],
    ["fi;q=-1,de;q=0.5", "de-DE"],
    ["fi;q=0.1234,de;q=0.5", "de-DE"],
    ["fi;unexpected=yes,de;q=0.5", "de-DE"],
    ["ko-KR", "en-US"],
    ["*", "en-US"],
    ["", "en-US"],
    [null, "en-US"],
  ])("matches %s to %s", (header, locale) => {
    expect(negotiateLocale(header)).toBe(locale);
  });
});
