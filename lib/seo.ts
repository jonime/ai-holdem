import "server-only";

import type { Metadata } from "next";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { getSiteOrigin } from "@/lib/site";

export function getLanguageAlternates(pathname = ""): Record<string, string> {
  const origin = getSiteOrigin();
  return Object.fromEntries([
    ...SUPPORTED_LOCALES.map((locale) => [locale, `${origin}/${locale}${pathname}`]),
    ["x-default", `${origin}/${DEFAULT_LOCALE}${pathname}`],
  ]);
}

export function getPageMetadata({
  locale,
  title,
  description,
  pathname = "",
  translated = true,
}: {
  locale: Locale;
  title: string;
  description: string;
  pathname?: string;
  translated?: boolean;
}): Metadata {
  const url = `${getSiteOrigin()}/${locale}${pathname}`;
  const socialTitle = title.startsWith("AI Hold'em")
    ? title
    : `${title} | AI Hold'em`;
  const image = {
    url: "/social-preview.png",
    width: 1731,
    height: 909,
    alt: "AI Hold'em – Play Texas Hold'em against AI bots; invite friends, create tables, or watch bots play",
  };
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: translated ? getLanguageAlternates(pathname) : {},
    },
    openGraph: {
      title: socialTitle,
      description,
      url,
      siteName: "AI Hold'em",
      type: "website",
      locale: locale.replace("-", "_"),
      ...(translated
        ? { alternateLocale: SUPPORTED_LOCALES.filter((value) => value !== locale)
            .map((value) => value.replace("-", "_")) }
        : {}),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [image],
    },
  };
}
