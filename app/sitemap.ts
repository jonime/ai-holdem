import type { MetadataRoute } from "next";

import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { getLanguageAlternates } from "@/lib/seo";
import { getSiteOrigin } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  return [
    ...SUPPORTED_LOCALES.map((locale) => ({
      url: `${origin}/${locale}`,
      alternates: { languages: getLanguageAlternates() },
      changeFrequency: "weekly" as const,
      priority: locale === "en-US" ? 1 : 0.8,
    })),
    ...SUPPORTED_LOCALES.map((locale) => ({
      url: `${origin}/${locale}/about`,
      alternates: { languages: getLanguageAlternates("/about") },
      changeFrequency: "monthly" as const,
      priority: locale === "en-US" ? 0.8 : 0.7,
    })),
    {
      url: `${origin}/en-US/developers`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
  ];
}
