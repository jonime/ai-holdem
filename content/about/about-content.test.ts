import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES } from "@/lib/i18n";

describe("localized About content", () => {
  it.each(SUPPORTED_LOCALES)("%s has the complete document structure", async (locale) => {
    const path = fileURLToPath(new URL(`./${locale}.mdx`, import.meta.url));
    const source = await readFile(path, "utf8");

    expect(source).toMatch(/export const metadata = \{[\s\S]*title: "[^"]+",[\s\S]*description: "[^"]+",[\s\S]*\}/);
    expect(source.match(/^# /gm)).toHaveLength(1);
    expect(source.match(/^## /gm)).toHaveLength(4);
    expect(source.match(/^### /gm)).toHaveLength(3);
    expect(source.match(/^#### /gm)).toHaveLength(3);
    expect(source).toContain("### Equity Rules");
    expect(source).toContain("### TypeSafe Jev");
    expect(source).toContain("OpenRouter");
    expect(source).toContain("@hivetech/poker-engine");
    expect(source).toContain("https://typesafe.ai/");
    expect(source).toContain("https://openrouter.ai/");
    expect(source).toContain("https://github.com/jonime/ai-holdem");
    expect(source).toContain(`](/${locale})`);
    expect(source).toContain(`](/${locale}/developers)`);
  });
});
