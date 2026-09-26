import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LanguageMenu } from "@/components/LanguageMenu";
import { getAboutDocument } from "@/lib/about/server";
import { hasLocale, SUPPORTED_LOCALES } from "@/lib/i18n";

import styles from "./page.module.css";

type AboutPageProps = Readonly<{
  params: Promise<{ lang: string }>;
}>;

export async function generateMetadata({
  params,
}: AboutPageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const { metadata } = await getAboutDocument(lang);

  return {
    title: metadata.title,
    description: metadata.description,
    alternates: {
      canonical: `/${lang}/about`,
      languages: Object.fromEntries(
        SUPPORTED_LOCALES.map((locale) => [locale, `/${locale}/about`]),
      ),
    },
  };
}

export default async function AboutPage({ params }: AboutPageProps) {
  "use cache";
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const { default: AboutContent } = await getAboutDocument(lang);

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <nav className={styles.pageNav} aria-label="About page navigation">
          <Link className={styles.homeLink} href={`/${lang}`}>
            <span aria-hidden="true">←</span> AI Hold&apos;em
          </Link>
          <LanguageMenu locale={lang} pathname="/about" />
        </nav>
        <AboutContent />
      </article>
    </main>
  );
}
