import type { ReactNode } from "react";
import { GameI18nBoundary } from "./[gameId]/layout";

// This segment has only the static language param; the game ID resolves below Suspense.
export default function GameLocaleLayout({ children, params }: {
  readonly children: ReactNode;
  readonly params: Promise<{ lang: string }>;
}) {
  return <GameI18nBoundary params={params}>{children}</GameI18nBoundary>;
}
