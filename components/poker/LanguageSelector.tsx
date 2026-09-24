"use client";

import { useRouter } from "next/navigation";

import { useI18n } from "@/components/poker/I18nProvider";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

const languageNames: Record<Locale, string> = {
  "en-US": "English",
  "fi-FI": "Suomi",
  "es-ES": "Español",
  "de-DE": "Deutsch",
  "sv-SE": "Svenska",
};

const sortedLocales = [...SUPPORTED_LOCALES].sort((left, right) =>
  languageNames[left].localeCompare(languageNames[right]),
);

export function LanguageSelector() {
  const router = useRouter();
  const { locale, t } = useI18n();

  return (
    <label className="language-selector">
      <span>{t("home.language")}</span>
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
