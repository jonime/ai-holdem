import Link from "next/link";

import type { Locale } from "@/lib/i18n";
import {
  LANGUAGE_LABELS,
  LANGUAGE_NAMES,
  SORTED_LOCALES,
} from "@/lib/i18n/languages";

import styles from "./LanguageMenu.module.css";

export function LanguageMenu({
  locale,
  pathname = "",
}: {
  readonly locale: Locale;
  readonly pathname?: "" | "/about";
}) {
  return (
    <details className={styles.menu}>
      <summary
        aria-label={`${LANGUAGE_LABELS[locale]}: ${LANGUAGE_NAMES[locale]}`}
      >
        {LANGUAGE_NAMES[locale]}
      </summary>
      <ul>
        {SORTED_LOCALES.map((supportedLocale) => (
          <li key={supportedLocale}>
            <Link
              href={`/${supportedLocale}${pathname}`}
              hrefLang={supportedLocale}
              lang={supportedLocale}
              aria-label={LANGUAGE_NAMES[supportedLocale]}
              aria-current={supportedLocale === locale ? "page" : undefined}
            >
              {LANGUAGE_NAMES[supportedLocale]}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
