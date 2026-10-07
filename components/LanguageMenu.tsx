import "server-only";

import { addLocalePrefix, type Locale } from "@/lib/i18n";
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
  const dialogId = `language-menu-${locale}`;

  return (
    <div className={styles.menu}>
      <button
        type="button"
        popoverTarget={dialogId}
        aria-haspopup="dialog"
        aria-label={`${LANGUAGE_LABELS[locale]}: ${LANGUAGE_NAMES[locale]}`}
      >
        <span aria-hidden="true">▾ </span>
        {LANGUAGE_NAMES[locale]}
      </button>
      <dialog
        id={dialogId}
        popover="auto"
        aria-label={LANGUAGE_LABELS[locale]}
      >
        <ul>
          {SORTED_LOCALES.map((supportedLocale) => (
            <li key={supportedLocale}>
              <a
                href={addLocalePrefix(`${pathname}`, supportedLocale)}
                hrefLang={supportedLocale}
                lang={supportedLocale}
                aria-label={LANGUAGE_NAMES[supportedLocale]}
                aria-current={supportedLocale === locale ? "page" : undefined}
              >
                {LANGUAGE_NAMES[supportedLocale]}
              </a>
            </li>
          ))}
        </ul>
      </dialog>
    </div>
  );
}
