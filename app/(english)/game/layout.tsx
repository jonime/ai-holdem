import type { ReactNode } from "react";
import { GameI18nBoundary } from "@/app/[lang]/game/[gameId]/layout";
import { englishParams } from "../locale";

export default function EnglishGameLocaleLayout({ children }: { readonly children: ReactNode }) {
  return <GameI18nBoundary params={englishParams()}>{children}</GameI18nBoundary>;
}
