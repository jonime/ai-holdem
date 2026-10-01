import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { getLanguageAlternates, getPageMetadata } from "@/lib/seo";
import { getSiteOrigin, PRODUCTION_ORIGIN } from "@/lib/site";

afterEach(() => vi.unstubAllEnvs());

describe("site origin", () => {
  it("uses a custom HTTP(S) origin without a path or credentials", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://user:pass@poker.example/subpath?query=1");
    expect(getSiteOrigin()).toBe("https://poker.example");
  });

  it("uses the production deployment domain when the optional origin is blank", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", " ");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "poker.example");
    expect(getSiteOrigin()).toBe("https://poker.example");
  });

  it.each(["invalid", "file:///tmp/poker", "javascript:alert(1)"])(
    "rejects an unusable canonical origin: %s", (origin) => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
      expect(getSiteOrigin()).toBe(PRODUCTION_ORIGIN);
    },
  );
});

describe("public SEO metadata", () => {
  it("gives each localized page its own canonical and social metadata", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://poker.example");
    const metadata = getPageMetadata({ locale: "fi-FI", title: "Tietoa", description: "Kuvaus", pathname: "/about" });
    expect(metadata.alternates?.canonical).toBe("https://poker.example/fi-FI/about");
    expect(metadata.alternates?.languages).toEqual(getLanguageAlternates("/about"));
    expect(metadata.openGraph).toMatchObject({ title: "Tietoa | AI Hold'em", description: "Kuvaus", url: "https://poker.example/fi-FI/about", locale: "fi_FI", images: [{ url: "/social-preview.png", width: 1731, height: 909 }] });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", description: "Kuvaus" });
  });

  it("does not advertise English developer content as translated", () => {
    const metadata = getPageMetadata({ locale: "en-US", title: "Developer resources", description: "Developer docs", pathname: "/developers", translated: false });
    expect(metadata.alternates?.languages).toEqual({});
    expect(metadata.openGraph).not.toHaveProperty("alternateLocale");
  });

  it("lists only durable content, with reciprocal language alternates", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://poker.example");
    const entries = sitemap();
    expect(entries).toHaveLength(SUPPORTED_LOCALES.length * 2 + 1);
    for (const locale of SUPPORTED_LOCALES) {
      for (const pathname of ["", "/about"]) {
        expect(entries.find((entry) => entry.url === `https://poker.example/${locale}${pathname}`)?.alternates?.languages).toEqual(getLanguageAlternates(pathname));
      }
    }
    expect(entries.at(-1)?.alternates).toBeUndefined();
    expect(entries.some((entry) => /\/game\/|\/join-game/.test(entry.url))).toBe(false);
    expect(robots()).toMatchObject({ sitemap: "https://poker.example/sitemap.xml", rules: { allow: "/", disallow: "/api/" } });
  });
});
