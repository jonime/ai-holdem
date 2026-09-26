import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { LanguageSelector } from "@/components/poker/LanguageSelector";
import { NewGameForm } from "@/components/poker/NewGameForm";
import { APP_NAME } from "@/lib/constants";
import { hasLocale } from "@/lib/i18n";
import {
  getLandingClientDictionary,
  getLandingServerDictionary,
  getMetadataDictionary,
} from "@/lib/i18n/server";
import { getSiteOrigin } from "@/lib/site";
import styles from "./page.module.css";

type LinkedTerm = Readonly<{ label: string; href: string }>;
type LinkedPart = string | ReactElement;

function linkTerms(text: string, terms: readonly LinkedTerm[]): LinkedPart[] {
  return terms.reduce<LinkedPart[]>((parts, term, termIndex) => {
    return parts.flatMap<LinkedPart>((part, partIndex) => {
      if (typeof part !== "string" || !part.includes(term.label)) return [part];
      const fragments = part.split(term.label);
      return fragments.flatMap((fragment, fragmentIndex) => [
        fragment,
        ...(fragmentIndex < fragments.length - 1
          ? [
              <a
                key={`${termIndex}-${partIndex}-${fragmentIndex}`}
                href={term.href}
                target="_blank"
                rel="noreferrer"
              >
                {term.label}
              </a>,
            ]
          : []),
      ]);
    });
  }, [text]);
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  "use cache";
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [metadata, landing, landingClient] = await Promise.all([
    getMetadataDictionary(lang),
    getLandingServerDictionary(lang),
    getLandingClientDictionary(lang),
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
        <LanguageSelector locale={lang} label={landingClient.language} />
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
        <NewGameForm locale={lang} messages={landingClient.newGame} />
      </section>
      <section className={styles.overview}>
        <h2>{landing.overviewHeading}</h2>
        <p>{landing.overviewIntro}</p>
        <h3>{landing.engineHeading}</h3>
        <p>
          {linkTerms(landing.engineBody, [
            {
              label: landing.engineLinkLabel,
              href: "https://www.npmjs.com/package/@hivetech/poker-engine",
            },
          ])}
        </p>
        <h3>{landing.privacyHeading}</h3>
        <p>
          {linkTerms(landing.privacyBody, [
            { label: "TypeSafe System One", href: "https://typesafe.ai/" },
            { label: "OpenRouter", href: "https://openrouter.ai/" },
          ])}
        </p>
      </section>
      <section
        className={styles.attribution}
        aria-label={landing.resources}
      >
        <p>
          {landing.sourceBeforeGitHub}
          <a
            href="https://github.com/jonime/ai-holdem"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          {landing.attributionAfterGitHub}{" "}
          <Link href={`/${lang}/developers`}>
            {landing.developerResources}
          </Link>
          .
        </p>
      </section>
    </main>
  );
}