import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";

import { I18nProvider } from "@/components/poker/I18nProvider";
import { TableLoadingShell } from "@/components/poker/TableLoadingShell";
import { addLocalePrefix, hasLocale } from "@/lib/i18n";
import { getGameDictionary } from "@/lib/i18n/server";

// Shared tables are viewable by URL, but should not become search results.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: null, languages: {} },
};

interface GameI18nBoundaryProps {
  readonly children: ReactNode;
  readonly params: Promise<{ lang: string }>;
}

export async function GameI18nBoundary({ children, params }: GameI18nBoundaryProps) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dictionary = await getGameDictionary(lang);

  return (
    <I18nProvider locale={lang} dictionary={dictionary}>
      <Suspense fallback={<TableLoadingShell label={dictionary.table.loading} homeHref={addLocalePrefix("/", lang)}
        controlLabels={[dictionary.gameHeader.help, dictionary.settings.title, dictionary.gameHeader.lobby]} />}>
        {children}
      </Suspense>
    </I18nProvider>
  );
}

export default function GameLayout({ children }: { readonly children: ReactNode }) {
  return children;
}
