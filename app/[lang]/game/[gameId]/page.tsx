import { Suspense } from "react";

import { GamePageContent } from "./GamePageContent";

interface GamePageParams {
  readonly params: Promise<{ lang: string; gameId: string }>;
}

export default function GamePage({ params }: GamePageParams) {
  return (
    <Suspense fallback={<main className="poker-app"><div className="route-loading" aria-label="Loading table" /></main>}>
      <GamePageContent params={params} />
    </Suspense>
  );
}