import { Suspense } from "react";

import { GamePageContent } from "./GamePageContent";
import styles from "./page.module.css";

interface GamePageParams {
  readonly params: Promise<{ lang: string; gameId: string }>;
}

export default function GamePage({ params }: GamePageParams) {
  return (
    <Suspense
      fallback={
        <main className={styles.loadingPage}>
          <div aria-label="Loading table" />
        </main>
      }
    >
      <GamePageContent params={params} />
    </Suspense>
  );
}
