import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import headerStyles from "@/components/poker/GameHeader.module.css";
import styles from "./page.module.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { hasLocale, addLocalePrefix } from "@/lib/i18n";
import { getGameDictionary } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/poker/I18nProvider";
import { SharedReplay } from "@/components/poker/SharedReplay";
// No token, source identifier, alternate/canonical URL or hand details in metadata.
export const metadata: Metadata = {
  title: "Shared replay", description: "A shared poker hand replay.",
  robots: { index: false, follow: false }, referrer: "no-referrer",
  alternates: null, openGraph: null, twitter: null,
};
async function Content({ params }: { params: Promise<{ lang: string; token: string }> }) {
  const { lang, token } = await params;
  if (!hasLocale(lang)) notFound();
  const dictionary = await getGameDictionary(lang);
  return <>
    <header className={headerStyles.gameHeader}>
      <div className={headerStyles.gameHeaderInner}>
        <Link href={addLocalePrefix("/", lang)} className={headerStyles.gameHeaderTitle}><span aria-hidden="true">♠ </span>{APP_NAME}</Link>
        <h1 className={styles.title}>{dictionary.sharing.title}</h1>
      </div>
    </header>
    <main className={styles.main}><I18nProvider locale={lang} dictionary={dictionary}>
      <SharedReplay key={token} token={token} />
    </I18nProvider></main>
  </>;
}
export default function SharedReplayPage(props: { params: Promise<{ lang: string; token: string }> }) {
  return <Suspense><Content {...props} /></Suspense>;
}
