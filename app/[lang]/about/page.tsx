import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LanguageMenu } from "@/components/LanguageMenu";
import { getAboutDocument } from "@/lib/about/server";
import { hasLocale } from "@/lib/i18n";

import { getPageMetadata } from "@/lib/seo";

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

  return getPageMetadata({
    locale: lang,
    title: metadata.title,
    description: metadata.description,
    pathname: "/about",
  });
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
        <div className={styles.content}>
          <AboutContent />
        </div>
      </article>
    </main>
  );
}
