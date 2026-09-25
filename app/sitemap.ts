import type { MetadataRoute } from "next";

import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { getSiteOrigin } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  return [
    ...SUPPORTED_LOCALES.map((locale) => ({
      url: `${origin}/${locale}`,
      changeFrequency: "weekly" as const,
      priority: locale === "en-US" ? 1 : 0.8,
    })),
    {
      url: `${origin}/en-US/developers`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
  ];
}
