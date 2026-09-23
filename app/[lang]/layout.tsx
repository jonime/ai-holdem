import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Space_Grotesk } from "next/font/google";

import { I18nProvider } from "@/components/poker/I18nProvider";
import { hasLocale, SUPPORTED_LOCALES } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n/server";

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
  const dictionary = await getDictionary(lang);
  return {
    title: dictionary.metadata.title,
    description: dictionary.metadata.description,
    icons: {
      icon: "/ai-holdem-logo.png",
      shortcut: "/ai-holdem-logo.png",
      apple: "/ai-holdem-logo.png",
    },
    manifest: "/manifest.webmanifest",
    openGraph: {
      title: dictionary.metadata.title,
      description: dictionary.metadata.description,
      images: [
        { url: "/ai-holdem-logo.png", alt: dictionary.metadata.logoAlt },
      ],
    },
    twitter: {
      card: "summary",
      title: dictionary.metadata.title,
      description: dictionary.metadata.description,
      images: ["/ai-holdem-logo.png"],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dictionary = await getDictionary(lang);

  return (
    <html lang={lang}>
      <body className={spaceGrotesk.variable}>
        <I18nProvider locale={lang} dictionary={dictionary}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
