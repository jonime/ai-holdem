import { PublicHeader } from "@/components/PublicHeader";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
      {await PublicHeader({ locale: lang, pathname: "/about" })}
      <article className={styles.card}>
        <div className={styles.content}>
          <AboutContent />
        </div>
      </article>
    </main>
  );
}
