import { PublicPageTools } from "@/components/PublicPageTools";
import { PublicHeader } from "@/components/PublicHeader";
import { CreationForm } from "@/components/creation/CreationForm";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { APP_NAME } from "@/lib/constants";
import { addLocalePrefix, hasLocale } from "@/lib/i18n";
import {
  getGameDictionary,
  getLandingServerDictionary,
  getMetadataDictionary,
} from "@/lib/i18n/server";
import { getSiteOrigin } from "@/lib/site";
import styles from "./page.module.css";

// Unknown first segments also match this route. Allow the root layout to reject
// them before streaming, preserving HTTP 404 instead of an empty Suspense shell.
// Supported locales still prerender with generateStaticParams and use cache.
export const instant = false;

export default async function Home({ params }: PageProps<"/[lang]">) {
  "use cache";
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [metadata, landing, gameDictionary] = await Promise.all([
    getMetadataDictionary(lang),
    getLandingServerDictionary(lang),
    getGameDictionary(lang),
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
      {await PublicHeader({ locale: lang, actions: await PublicPageTools({ locale: lang, destination: "/" }) })}
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
        <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>♠ {APP_NAME}</p>
        <h1>{landing.hero.title}</h1>
        <p className={styles.intro}>{landing.intro}</p>
        <p className={styles.supportingCopy}>{landing.supportingCopy}</p>
        <div className={styles.actions}>
          <CreationForm quickPlayLabel={landing.quickPlay} locale={lang} labels={gameDictionary.creation} action={addLocalePrefix("/quick-game", lang)} />
          <Link className={styles.joinGame} href={addLocalePrefix("/play", lang)}>{landing.hero.create}</Link>
        </div>
        <p className={styles.promise}>{landing.hero.promise}</p>
        </div>
        <div className={styles.illustration}><Image src="/poker-club.webp" alt="" width={1200} height={800} sizes="(max-width: 640px) 100vw, 55vw" preload /></div>
      </section>
      <section className={styles.botCards} aria-label={landing.content.bots.title}>
        {([
          ["Equity Rules", "♣", gameDictionary.botInformation.providers.rules],
          ["TypeSafe Jev", "♠", gameDictionary.botInformation.providers.typesafe],
          ["Upright Eevo", "♦", gameDictionary.botInformation.providers.eevo],
          ["LLM", "♥", gameDictionary.botInformation.providers.llm],
        ] as const).map(([name, icon, description]) => <article key={name}>
          <span className={styles.botIcon} aria-hidden="true">{icon}</span><h2>{name}</h2><p>{description}</p>
        </article>)}
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
