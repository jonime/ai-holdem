import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { PLAYER_TOKEN_COOKIE_NAME } from "@/lib/identity/player-token";
import { hasLocale } from "@/lib/i18n";
import { getJoinGameDictionary } from "@/lib/i18n/server";
import { getPublicDirectoryPage } from "@/lib/poker/public-directory-cache";
import { JoinDirectory } from "./JoinDirectory";
import { getPageMetadata } from "@/lib/seo";

import styles from "./page.module.css";

export async function generateMetadata({ params }: PageProps<"/[lang]/join-game">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dictionary = await getJoinGameDictionary(lang);
  return {
    ...getPageMetadata({ locale: lang, title: dictionary.title, description: dictionary.intro, pathname: "/join-game" }),
    robots: { index: false, follow: true },
  };
}

async function DirectoryContent({ lang, dictionary }: {
  readonly lang: Parameters<typeof getJoinGameDictionary>[0];
  readonly dictionary: Awaited<ReturnType<typeof getJoinGameDictionary>>;
}) {
  const cookieStore = await cookies();
  let initialPage: Awaited<ReturnType<typeof getPublicDirectoryPage>> = {
    games: [],
    nextCursor: null,
  };
  let initialError = false;
  try {
    initialPage = await getPublicDirectoryPage(
      cookieStore.get(PLAYER_TOKEN_COOKIE_NAME)?.value ?? null,
    );
  } catch (error) {
    console.error("Unable to render public game directory", error);
    initialError = true;
  }
  return <JoinDirectory locale={lang} dictionary={dictionary} initialGames={initialPage.games} initialCursor={initialPage.nextCursor} initialError={initialError} />;
}

export default async function JoinGamePage({ params }: PageProps<"/[lang]/join-game">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dictionary = await getJoinGameDictionary(lang);

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.headingRow}>
          <div><h1>{dictionary.title}</h1><p>{dictionary.intro}</p></div>
          <Link href={`/${lang}`}>{dictionary.back}</Link>
        </div>
        <Suspense fallback={<div className={styles.directoryLoading} aria-busy="true" aria-label={dictionary.refreshing} />}>
          <DirectoryContent lang={lang} dictionary={dictionary} />
        </Suspense>
      </section>
    </main>
  );
}
