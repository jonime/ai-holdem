import "server-only";
import { Suspense } from "react";
import { Button } from "./Button";
import { I18nProvider } from "./poker/I18nProvider";
import { PublicPageControls } from "./PublicPageControls";
import { getGameDictionary } from "@/lib/i18n/server";
import { getHelpDocument } from "@/lib/help/server";
import type { Locale } from "@/lib/i18n";
import styles from "./PublicPageControls.module.css";

export async function PublicPageTools({ locale, destination }: { locale: Locale; destination: string }) {
  const [dictionary, { default: HelpContent, title }] = await Promise.all([getGameDictionary(locale), getHelpDocument(locale)]);
  return <I18nProvider locale={locale} dictionary={dictionary}>
    <Suspense fallback={<div className={styles.controls}>
      <Button variant="ghost" size="small" disabled aria-haspopup="dialog">{dictionary.gameHeader.help}</Button>
      <Button variant="ghost" size="small" disabled aria-haspopup="dialog">{dictionary.settings.title}</Button>
    </div>}>
      <PublicPageControls destination={destination} helpTitle={title} helpContent={<HelpContent />} />
    </Suspense>
  </I18nProvider>;
}
