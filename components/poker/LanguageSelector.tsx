"use client";

import { useRouter } from "next/navigation";

import styles from "@/components/poker/LanguageSelector.module.css";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

const languageNames: Record<Locale, string> = {
  "en-US": "English",
  "fi-FI": "Suomi",
  "es-ES": "Español",
  "de-DE": "Deutsch",
  "sv-SE": "Svenska",
  "fr-FR": "Français",
  "pt-BR": "Português (Brasil)",
  "it-IT": "Italiano",
  "nl-NL": "Nederlands",
  "pl-PL": "Polski",
};

const sortedLocales = [...SUPPORTED_LOCALES].sort((left, right) =>
  languageNames[left].localeCompare(languageNames[right]),
);

export function LanguageSelector({
  locale,
  label,
}: {
  readonly locale: Locale;
  readonly label: string;
}) {
  const router = useRouter();

  return (
    <label className={styles.languageSelector}>
      <span>{label}</span>
      <select
        value={locale}
        onChange={(event) => router.push(`/${event.target.value}`)}
      >
        {sortedLocales.map((supportedLocale) => (
          <option key={supportedLocale} value={supportedLocale}>
            {languageNames[supportedLocale]}
          </option>
        ))}
      </select>
    </label>
  );
}
