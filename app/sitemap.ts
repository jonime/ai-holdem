import type { MetadataRoute } from "next";

import { addLocalePrefix, SUPPORTED_LOCALES } from "@/lib/i18n";
import { getLanguageAlternates } from "@/lib/seo";
import { getSiteOrigin } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  return [
    ...SUPPORTED_LOCALES.map((locale) => ({
      url: `${origin}${addLocalePrefix("/", locale)}`,
      alternates: { languages: getLanguageAlternates() },
      changeFrequency: "weekly" as const,
      priority: locale === "en-US" ? 1 : 0.8,
    })),
    ...SUPPORTED_LOCALES.map((locale) => ({
      url: `${origin}${addLocalePrefix("/about", locale)}`,
      alternates: { languages: getLanguageAlternates("/about") },
      changeFrequency: "monthly" as const,
      priority: locale === "en-US" ? 0.8 : 0.7,
    })),
    {
      url: `${origin}/developers`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
  ];
}
