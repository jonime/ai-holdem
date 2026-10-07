import { Suspense } from "react";
import { GamePageContent } from "@/app/[lang]/game/[gameId]/GamePageContent";
import styles from "@/app/[lang]/game/[gameId]/page.module.css";
import { DEFAULT_LOCALE } from "@/lib/i18n";

async function EnglishGameContent({ params }: PageProps<"/game/[gameId]">) {
  const { gameId } = await params;
  return <GamePageContent params={Promise.resolve({ lang: DEFAULT_LOCALE, gameId })} />;
}

export default function EnglishGamePage(props: PageProps<"/game/[gameId]">) {
  return (
    <Suspense fallback={<main className={styles.loadingPage}><div aria-label="Loading table" /></main>}>
      <EnglishGameContent {...props} />
    </Suspense>
  );
}
