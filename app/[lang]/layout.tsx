import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Space_Grotesk } from "next/font/google";

import { hasLocale, SUPPORTED_LOCALES } from "@/lib/i18n";
import { getMetadataDictionary } from "@/lib/i18n/server";
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

  return (
    <html lang={lang}>
      <body className={spaceGrotesk.variable}>{children}</body>
    </html>
  );
}