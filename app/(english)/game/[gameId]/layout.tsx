import { Suspense, type ReactNode } from "react";
import { GameI18nBoundary } from "@/app/[lang]/game/[gameId]/layout";
import { englishParams } from "../../locale";

export { metadata } from "@/app/[lang]/game/[gameId]/layout";

export default function EnglishGameLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<main aria-busy="true" />}>
      <GameI18nBoundary params={englishParams()}>{children}</GameI18nBoundary>
    </Suspense>
  );
}
