import { PublicHeader } from "@/components/PublicHeader";
import { CreationForm } from "@/components/creation/CreationForm";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PLAYER_TOKEN_COOKIE_NAME } from "@/lib/identity/player-token";
import { addLocalePrefix, hasLocale, type Locale } from "@/lib/i18n";
import { getGameDictionary, getPlayDictionary, getJoinGameDictionary } from "@/lib/i18n/server";
import type { PlayDictionary, JoinGameDictionary } from "@/lib/i18n/types";
import { getPublicDirectoryPage } from "@/lib/poker/public-directory-cache";
import { listMyGames } from "@/lib/poker/my-games";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import type { MyGameSummary } from "@/lib/http/discovery-contracts";
import { getPageMetadata } from "@/lib/seo";
import { JoinDirectory } from "./JoinDirectory";
import { MyTables } from "./MyTables";
import { I18nProvider } from "@/components/poker/I18nProvider";
import { listOwnedShares } from "@/lib/poker/owned-shares";
import { SharedHands } from "./SharedHands";
import { PublicPageTools } from "@/components/PublicPageTools";
import { parsePlayTab, playTabPath, playTabs } from "./tabs";
import { PlayerName } from "./PlayerName";
import { CollectionShell, CollectionSkeleton } from "./Collection";
import styles from "./page.module.css";

// Resolve only the URL-selected shell before the first flush; collection reads still stream.
export const instant = false;

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
export async function DirectoryContent({ lang, dictionary, collectionTitle }: { lang: Locale; dictionary: JoinGameDictionary; collectionTitle?: string }) {
  const store = await cookies();
  let page: Awaited<ReturnType<typeof getPublicDirectoryPage>> = { games: [], nextCursor: null };
  let error = false;
  try { page = await getPublicDirectoryPage(store.get(PLAYER_TOKEN_COOKIE_NAME)?.value ?? null); }
  catch { error = true; }
  return <JoinDirectory collectionTitle={collectionTitle} locale={lang} dictionary={dictionary} initialGames={page.games} initialCursor={page.nextCursor} initialError={error} />;
}
export async function SharedContent({ lang, dictionary }: { lang: Locale; dictionary: PlayDictionary }) {
  const store = await cookies();
  let page: Awaited<ReturnType<typeof listOwnedShares>> = { shares: [], nextCursor: null };
  let error = false;
  try { page = await listOwnedShares(store.get(PLAYER_TOKEN_COOKIE_NAME)?.value ?? null); }
  catch { error = true; }
  // Request-time expiry snapshot after cookies/database access, shared with hydration.
  // eslint-disable-next-line react-hooks/purity
  return <SharedHands locale={lang} dictionary={dictionary} initialPage={page} initialError={error} initialNow={Date.now()} />;
}
export default function PlayPage(props: PageProps<"/[lang]/play">) {
  return <PlayPanel {...props} />;
}
async function PlayPanel({ params, searchParams }: PageProps<"/[lang]/play">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [d, directory, gameDictionary] = await Promise.all([getPlayDictionary(lang), getJoinGameDictionary(lang), getGameDictionary(lang)]);
  return <I18nProvider locale={lang} dictionary={gameDictionary}><main className={styles.page}>{await PublicHeader({ locale: lang, pathname: "/play", actions: await SettingsContent({ lang, searchParams }) })}<div className={styles.panel}>
    <div className={styles.headingRow}><div><h1 id="play-heading" tabIndex={-1}>{d.title}</h1><p>{d.intro}</p></div></div>
    <CreationForm locale={lang} labels={gameDictionary.creation} className={styles.controls} action={addLocalePrefix("/quick-game", lang)} quickPlayLabel={d.quickPlay} createTableLabel={d.createTable}>
      <PlayerName dictionary={directory} />
    </CreationForm>
    {await Collections({ lang, d, directory, searchParams })}
  </div></main></I18nProvider>;
}

async function SettingsContent({ lang, searchParams }: Pick<PageProps<"/[lang]/play">, "searchParams"> & { lang: Locale }) {
  const tab = parsePlayTab((await searchParams).tab);
  return PublicPageTools({ locale: lang, destination: playTabPath(tab) });
}
export async function Collections({ lang, d, directory, searchParams }: {
  lang: Locale; d: PlayDictionary; directory: JoinGameDictionary; searchParams: PageProps<"/[lang]/play">["searchParams"];
}) {
  const tab = parsePlayTab((await searchParams).tab);
  return <>
    <nav className={styles.tabs} aria-label={d.collections}>
      {playTabs.map(value => <Link key={value} href={addLocalePrefix(playTabPath(value), lang)} prefetch={false}
        aria-current={tab === value ? "page" : undefined}>{value === "personal" ? d.yourTables : value === "public" ? d.publicTables : d.sharedHands}</Link>)}
    </nav>
    <CollectionShell key={`${lang}:${tab}`} id={tab === "personal" ? "my-tables-heading" : tab === "shared" ? "shared-hands-heading" : "public-tables-heading"}
      title={tab === "personal" ? d.yourTables : tab === "shared" ? d.sharedHands : d.publicTables}
      hasAction={tab !== "personal"}>
      <Suspense fallback={<CollectionSkeleton label={directory.loadingMore} refreshLabel={tab === "personal" ? undefined : tab === "shared" ? `${d.refreshList}: ${d.sharedHands}` : `${directory.refresh}: ${d.publicTables}`} />}>
        {tab === "personal" ? <PersonalContent lang={lang} dictionary={d} /> : tab === "shared" ? <SharedContent lang={lang} dictionary={d} /> :
          <DirectoryContent lang={lang} dictionary={directory} collectionTitle={d.publicTables} />}
      </Suspense>
    </CollectionShell>
  </>;
}
