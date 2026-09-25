import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { LanguageSelector } from "@/components/poker/LanguageSelector";
import { NewGameForm } from "@/components/poker/NewGameForm";
import { APP_NAME } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n/server";
import { hasLocale } from "@/lib/i18n";
import { getSiteOrigin } from "@/lib/site";
import { notFound } from "next/navigation";
import styles from "./page.module.css";

type LinkedTerm = Readonly<{ label: string; href: string }>;

function linkTerms(text: string, terms: readonly LinkedTerm[]): ReactNode[] {
  return terms.reduce<ReactNode[]>((parts, term, termIndex) => {
    return parts.flatMap((part, partIndex) => {
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
  const dictionary = await getDictionary(lang);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: APP_NAME,
    description: dictionary.metadata.description,
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
        aria-label={dictionary.home.startRegion}
      >
        <LanguageSelector />
        <Image
          className={styles.mark}
          src="/ai-holdem-logo.png"
          alt={dictionary.metadata.title}
          width={270}
          height={270}
          sizes="(max-width: 450px) 60vw, 270px"
          priority
        />
        <h1>{APP_NAME}</h1>
        <p>{dictionary.home.intro}</p>
        <NewGameForm />
      </section>
      <section className={styles.overview}>
        <h2>{dictionary.home.overviewHeading}</h2>
        <p>{dictionary.home.overviewIntro}</p>
        <h3>{dictionary.home.engineHeading}</h3>
        <p>
          {linkTerms(dictionary.home.engineBody, [
            {
              label: dictionary.home.engineLinkLabel,
              href: "https://www.npmjs.com/package/@hivetech/poker-engine",
            },
          ])}
        </p>
        <h3>{dictionary.home.privacyHeading}</h3>
        <p>
          {linkTerms(dictionary.home.privacyBody, [
            { label: "TypeSafe System One", href: "https://typesafe.ai/" },
            { label: "OpenRouter", href: "https://openrouter.ai/" },
          ])}
        </p>
      </section>
      <section
        className={styles.attribution}
        aria-label={dictionary.home.resources}
      >
        <p>
          {dictionary.home.sourceBeforeGitHub}
          <a
            href="https://github.com/jonime/ai-holdem"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          {dictionary.home.attributionAfterGitHub}{" "}
          <Link href={`/${lang}/developers`}>
            {dictionary.home.developerResources}
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
