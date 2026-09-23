import Image from "next/image";

import { NewGameForm } from "@/components/poker/NewGameForm";
import { APP_NAME } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n/server";
import { hasLocale } from "@/lib/i18n";
import { notFound } from "next/navigation";

export default async function Home({ params }: PageProps<"/[lang]">) {
  "use cache";
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dictionary = await getDictionary(lang);

  return (
    <main className="poker-app">
      <section className="empty-state home-empty-state" aria-label={dictionary.home.startRegion}>
        <Image
          className="empty-state-mark"
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
      <section className="home-attribution" aria-label={dictionary.home.aboutBots}>
        <p>
          The bots at this table use{" "}
          <a href="https://typesafe.ai/" target="_blank" rel="noreferrer">TypeSafe</a>{" "}
          for their poker decisions. View the source on{" "}
          <a href="https://github.com/jonime/ai-holdem" target="_blank" rel="noreferrer">GitHub</a>.
        </p>
      </section>
    </main>
  );
}