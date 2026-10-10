import "server-only";

import type { ComponentType } from "react";
import type { Locale } from "@/lib/i18n";

export interface HelpDocument {
  readonly default: ComponentType;
  readonly title: string;
}

const documents: Record<Locale, () => Promise<HelpDocument>> = {
  "en-US": () => import("@/content/help/en-US.mdx"),
  "fi-FI": () => import("@/content/help/fi-FI.mdx"),
  "es-ES": () => import("@/content/help/es-ES.mdx"),
  "de-DE": () => import("@/content/help/de-DE.mdx"),
  "sv-SE": () => import("@/content/help/sv-SE.mdx"),
  "fr-FR": () => import("@/content/help/fr-FR.mdx"),
  "pt-BR": () => import("@/content/help/pt-BR.mdx"),
  "it-IT": () => import("@/content/help/it-IT.mdx"),
  "nl-NL": () => import("@/content/help/nl-NL.mdx"),
  "pl-PL": () => import("@/content/help/pl-PL.mdx"),
  "ja-JP": () => import("@/content/help/ja-JP.mdx"),
  "zh-Hans": () => import("@/content/help/zh-Hans.mdx"),
};

export function getHelpDocument(locale: Locale): Promise<HelpDocument> {
  return documents[locale]();
}
