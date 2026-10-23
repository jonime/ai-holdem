import { AppearanceControl } from "@/components/AppearanceControl";
import { appearanceLabels } from "@/lib/theme/labels";
import { THEME_INITIALIZATION } from "@/lib/theme/preference";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Space_Grotesk } from "next/font/google";

import { FEEDBACK_FORM_URL } from "@/lib/constants";
import styles from "./layout.module.css";

import { PerformanceInsights } from "@/components/PerformanceInsights";
import { hasLocale, SUPPORTED_LOCALES } from "@/lib/i18n";
import { getLandingServerDictionary, getMetadataDictionary } from "@/lib/i18n/server";
import { getSiteOrigin } from "@/lib/site";
import { getPageMetadata } from "@/lib/seo";

import "../globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  weight: "700",
});

type LocaleLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: LocaleLayoutProps): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dictionary = await getMetadataDictionary(lang);
  return {
    metadataBase: new URL(getSiteOrigin()),
    ...getPageMetadata({
      locale: lang,
      title: dictionary.title,
      description: dictionary.description,
    }),
    applicationName: "AI Hold'em",
    title: { default: dictionary.title, template: "%s | AI Hold'em" },
    robots: { index: true, follow: true },
    icons: {
      icon: "/ai-holdem-logo.png",
      shortcut: "/ai-holdem-logo.png",
      apple: "/ai-holdem-logo.png",
    },
    manifest: "/manifest.webmanifest",
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const dictionary = await getLandingServerDictionary(lang);

  return (
    <html lang={lang} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INITIALIZATION }} /></head>
      <body className={spaceGrotesk.variable}>
        {children}
        <footer className={styles.footer}>
          <AppearanceControl compact labels={appearanceLabels[lang]} />
          <a
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${dictionary.feedback} (${dictionary.feedbackNewTab})`}
            title={dictionary.feedbackNewTab}
          >
            {dictionary.feedback} <span aria-hidden="true">↗</span>
          </a>
        </footer>
        <Suspense><PerformanceInsights /></Suspense>
      </body>
    </html>
  );
}
