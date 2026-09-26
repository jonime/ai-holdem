import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LanguageMenu } from "@/components/LanguageMenu";
import { APP_NAME } from "@/lib/constants";
import { hasLocale } from "@/lib/i18n";
import {
  getLandingServerDictionary,
  getMetadataDictionary,
} from "@/lib/i18n/server";
import { getSiteOrigin } from "@/lib/site";
import styles from "./page.module.css";

export default async function Home({ params }: PageProps<"/[lang]">) {
  "use cache";
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [metadata, landing] = await Promise.all([
    getMetadataDictionary(lang),
    getLandingServerDictionary(lang),
  ]);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: APP_NAME,
    description: metadata.description,
    url: `${getSiteOrigin()}/${lang}`,
    applicationCategory: "GameApplication",
    operatingSystem: "Any web browser",
    isAccessibleForFree: true,
    codeRepository: "https://github.com/jonime/ai-holdem",
  };

  return (
    <main className={styles.home}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <section
        className={styles.emptyState}
        aria-label={landing.startRegion}
      >
        <LanguageMenu locale={lang} />
        <Image
          className={styles.mark}
          src="/ai-holdem-logo.png"
          alt={metadata.title}
          width={270}
          height={270}
          sizes="(max-width: 450px) 60vw, 270px"
          preload
          fetchPriority="high"
        />
        <h1>{APP_NAME}</h1>
        <p>{landing.intro}</p>
        <form method="post" action={`/${lang}/new-game`}>
          <button className={styles.newGame} type="submit">
            {landing.newGame}
          </button>
        </form>
      </section>
      <nav
        className={styles.attribution}
        aria-label={landing.resources}
      >
        <Link href={`/${lang}/about`}>{landing.about}</Link>
        <span aria-hidden="true">·</span>
        <Link href={`/${lang}/developers`}>
          {landing.developerResources}
        </Link>
        <span aria-hidden="true">·</span>
        <a
          href="https://github.com/jonime/ai-holdem"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </nav>
    </main>
  );
}
