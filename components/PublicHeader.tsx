import "server-only";
import type { ReactNode } from "react";
import Link from "next/link";
import { addLocalePrefix, type Locale } from "@/lib/i18n";
import { getLandingServerDictionary } from "@/lib/i18n/server";
import { appearanceLabels } from "@/lib/theme/labels";
import { LanguageMenu } from "./LanguageMenu";
import { AppearanceControl } from "./AppearanceControl";
import styles from "./PublicHeader.module.css";
export async function PublicHeader({ locale, pathname = "", actions }: { actions?: ReactNode; locale: Locale; pathname?: "" | "/about" | "/play" | "/developers" }) {
  const labels = await getLandingServerDictionary(locale);
  return <header className={styles.header}>
    <Link className={styles.brand} href={addLocalePrefix("/", locale)}><span aria-hidden="true">♠</span> AI Hold’em</Link>
    <nav aria-label={labels.resources}><Link href={addLocalePrefix("/play", locale)}>{labels.play}</Link><Link href={addLocalePrefix("/about", locale)}>{labels.about}</Link></nav>
    <div className={styles.preferences}><LanguageMenu locale={locale} pathname={pathname} />{actions}<AppearanceControl compact labels={appearanceLabels[locale]} /></div>
  </header>;
}
