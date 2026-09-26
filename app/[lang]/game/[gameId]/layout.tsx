import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";

import { GameHeader } from "@/components/poker/GameHeader";
import { I18nProvider } from "@/components/poker/I18nProvider";
import { hasLocale } from "@/lib/i18n";
import { getGameDictionary } from "@/lib/i18n/server";

interface GameI18nBoundaryProps {
  readonly children: ReactNode;
  readonly params: Promise<{ lang: string; gameId: string }>;
}

export async function GameI18nBoundary({ children, params }: GameI18nBoundaryProps) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dictionary = await getGameDictionary(lang);

  return (
    <I18nProvider locale={lang} dictionary={dictionary}>
      <GameHeader />
      {children}
    </I18nProvider>
  );
}

export default function GameLayout({
  children,
  params,
}: LayoutProps<"/[lang]/game/[gameId]">) {
  return (
    <Suspense fallback={<main aria-busy="true" />}>
      <GameI18nBoundary params={params}>{children}</GameI18nBoundary>
    </Suspense>
  );
}