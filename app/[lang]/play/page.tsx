import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PLAYER_TOKEN_COOKIE_NAME } from "@/lib/identity/player-token";
import { addLocalePrefix, hasLocale, type Locale } from "@/lib/i18n";
import { getPlayDictionary, getJoinGameDictionary } from "@/lib/i18n/server";
import type { PlayDictionary, JoinGameDictionary } from "@/lib/i18n/types";
import { getPublicDirectoryPage } from "@/lib/poker/public-directory-cache";
import { listMyGames } from "@/lib/poker/my-games";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import type { MyGameSummary } from "@/lib/http/discovery-contracts";
import { getPageMetadata } from "@/lib/seo";
import { Button } from "@/components/Button";
import { JoinDirectory } from "./JoinDirectory";
import { MyTables } from "./MyTables";
import { PlayerName } from "./PlayerName";
import styles from "./page.module.css";

export async function generateMetadata({ params }: PageProps<"/[lang]/play">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const d = await getPlayDictionary(lang);
  return { ...getPageMetadata({ locale: lang, title: d.title, description: d.intro, pathname: "/play" }), robots: { index: false, follow: true } };
}
export async function PersonalContent({ lang, dictionary }: { lang: Locale; dictionary: PlayDictionary }) {
  const store = await cookies();
  const token = store.get(PLAYER_TOKEN_COOKIE_NAME)?.value;
  let games: readonly MyGameSummary[] = [];
  let error = false;
  try { if (token) games = (await listMyGames(createSupabaseGameRepository(), token)).games; }
  catch { error = true; }
  return <MyTables locale={lang} dictionary={dictionary} initialGames={games} initialError={error} />;
}
export async function DirectoryContent({ lang, dictionary }: { lang: Locale; dictionary: JoinGameDictionary }) {
  const store = await cookies();
  let page: Awaited<ReturnType<typeof getPublicDirectoryPage>> = { games: [], nextCursor: null };
  let error = false;
  try { page = await getPublicDirectoryPage(store.get(PLAYER_TOKEN_COOKIE_NAME)?.value ?? null); }
  catch { error = true; }
  return <JoinDirectory locale={lang} dictionary={dictionary} initialGames={page.games} initialCursor={page.nextCursor} initialError={error} />;
}
export default async function PlayPage({ params }: PageProps<"/[lang]/play">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [d, directory] = await Promise.all([getPlayDictionary(lang), getJoinGameDictionary(lang)]);
  return <main className={styles.page}><div className={styles.panel}>
    <div className={styles.headingRow}><div><h1>{d.title}</h1><p>{d.intro}</p></div><Link href={addLocalePrefix("/", lang)}>{directory.back}</Link></div>
    <div className={styles.controls}>
      <PlayerName dictionary={directory} />
      <form method="post" action={addLocalePrefix("/quick-game", lang)}><Button type="submit">{d.quickPlay}</Button></form>
      <form method="post" action={addLocalePrefix("/new-game", lang)}><Button type="submit">{d.createTable}</Button></form>
    </div>
      <Suspense fallback={<p role="status">{d.loadingPersonal}</p>}><PersonalContent lang={lang} dictionary={d} /></Suspense>
      <section className={`${styles.section} ${styles.publicSection}`} aria-labelledby="public-tables-heading"><h2 id="public-tables-heading">{d.publicTables}</h2>
        <Suspense fallback={<p role="status">{d.loadingPublic}</p>}><DirectoryContent lang={lang} dictionary={directory} /></Suspense>
      </section>

  </div></main>;
}
