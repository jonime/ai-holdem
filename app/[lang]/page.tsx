import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LanguageMenu } from "@/components/LanguageMenu";
import { Button } from "@/components/Button";
import { APP_NAME } from "@/lib/constants";
import { addLocalePrefix, hasLocale } from "@/lib/i18n";
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
    url: `${getSiteOrigin()}${addLocalePrefix("/", lang)}`,
    applicationCategory: "GameApplication",
    operatingSystem: "Any web browser",
    isAccessibleForFree: true,
    codeRepository: "https://github.com/jonime/ai-holdem",
  };
  const faqItems = Object.values(landing.content.faq.items);
  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
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
          alt={metadata.logoAlt}
          width={270}
          height={270}
          sizes="(max-width: 450px) 60vw, 270px"
          preload
          fetchPriority="high"
        />
        <h1>{APP_NAME}</h1>
        <p className={styles.intro}>{landing.intro}</p>
        <p className={styles.supportingCopy}>{landing.supportingCopy}</p>
        <div className={styles.actions}>
          <form method="post" action={addLocalePrefix("/quick-game", lang)}>
            <Button variant="primary" size="large" type="submit">
              {landing.quickPlay}
            </Button>
          </form>
          <Link className={styles.joinGame} href={addLocalePrefix("/play", lang)}>{landing.play}</Link>
        </div>
      </section>
      <nav
        className={styles.attribution}
        aria-label={landing.resources}
      >
        <Link href={addLocalePrefix("/about", lang)}>{landing.about}</Link>
        <span aria-hidden="true">·</span>
        <Link href={addLocalePrefix("/developers", lang)}>
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
      <div className={styles.content}>
        <section aria-labelledby="play-heading">
          <h2 id="play-heading">{landing.content.play.title}</h2>
          <p>{landing.content.play.intro}</p>
          <p>{landing.content.play.tables}</p>
        </section>
        <section aria-labelledby="bots-heading">
          <h2 id="bots-heading">{landing.content.bots.title}</h2>
          <p>{landing.content.bots.description}</p>
          <p>
            <Link href={addLocalePrefix("/about", lang)}>
              {landing.content.bots.aboutLink}
            </Link>
          </p>
        </section>
        <section aria-labelledby="faq-heading">
          <h2 id="faq-heading">{landing.content.faq.title}</h2>
          {faqItems.map(({ question, answer }) => (
            <div className={styles.faqItem} key={question}>
              <h3>{question}</h3>
              <p>{answer}</p>
            </div>
          ))}
        </section>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqStructuredData).replace(/</g, "\\u003c"),
          }}
        />
      </div>
    </main>
  );
}
