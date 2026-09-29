import { Suspense } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { PLAYER_TOKEN_COOKIE_NAME } from "@/lib/identity/player-token";
import { hasLocale } from "@/lib/i18n";
import { getJoinGameDictionary } from "@/lib/i18n/server";
import { listPublicGames } from "@/lib/poker/directory";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { JoinDirectory } from "./JoinDirectory";
import styles from "./page.module.css";

async function DirectoryContent({ params }: { readonly params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dictionary, cookieStore] = await Promise.all([getJoinGameDictionary(lang), cookies()]);
  let initialGames: Awaited<ReturnType<typeof listPublicGames>> = [];
  let initialError = false;
  try {
    initialGames = await listPublicGames(
      createSupabaseGameRepository(),
      cookieStore.get(PLAYER_TOKEN_COOKIE_NAME)?.value ?? null,
    );
  } catch (error) {
    console.error("Unable to render public game directory", error);
    initialError = true;
  }
  const last = initialGames.at(-1);
  const nextCursor = initialGames.length === 50 && last
    ? Buffer.from(JSON.stringify({ publishedAt: last.publishedAt, gameId: last.gameId })).toString("base64url")
    : null;
  return <JoinDirectory locale={lang} dictionary={dictionary} initialGames={initialGames} initialCursor={nextCursor} initialError={initialError} />;
}

export default function JoinGamePage({ params }: PageProps<"/[lang]/join-game">) {
  return (
    <main className={styles.page}>
      <Suspense fallback={<section className={styles.panel} aria-busy="true" />}>
        <DirectoryContent params={params} />
      </Suspense>
    </main>
  );
}
