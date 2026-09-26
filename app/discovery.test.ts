import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import robots from "./robots";
import sitemap from "./sitemap";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

describe("machine-readable discovery", () => {
  it("publishes localized product and developer URLs in the sitemap", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test/ignored-path";

    const entries = sitemap();

    expect(entries).toContainEqual(
      expect.objectContaining({ url: "https://example.test/en-US" }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({ url: "https://example.test/fi-FI/about" }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        url: "https://example.test/en-US/developers",
      }),
    );
  });

  it("allows crawling and points robots.txt at the sitemap", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test";

    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://example.test/sitemap.xml",
      host: "https://example.test",
    });
  });

  it("keeps llms.txt in the specified Markdown file-list format", async () => {
    const path = fileURLToPath(new URL("../public/llms.txt", import.meta.url));
    const contents = await readFile(path, "utf8");

    expect(contents.startsWith("# AI Hold'em\n\n> ")).toBe(true);
    expect(contents).toContain(
      "[About AI Hold'em](https://ai-holdem.vercel.app/en-US/about)",
    );
    expect(contents).toMatch(/\n## Developer|\n## Product/);
    for (const section of contents.split(/\n## /).slice(1)) {
      expect(section).toMatch(/\n\n- \[[^\]]+\]\(https:\/\//);
    }
  });
});
