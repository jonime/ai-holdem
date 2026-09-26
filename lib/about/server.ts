import "server-only";

import type { ComponentType } from "react";

import type { Locale } from "@/lib/i18n";

export interface AboutDocument {
  readonly default: ComponentType;
  readonly metadata: {
    readonly title: string;
    readonly description: string;
  };
}

const documents: Record<Locale, () => Promise<AboutDocument>> = {
  "en-US": () => import("@/content/about/en-US.mdx"),
  "fi-FI": () => import("@/content/about/fi-FI.mdx"),
  "es-ES": () => import("@/content/about/es-ES.mdx"),
  "de-DE": () => import("@/content/about/de-DE.mdx"),
  "sv-SE": () => import("@/content/about/sv-SE.mdx"),
  "fr-FR": () => import("@/content/about/fr-FR.mdx"),
  "pt-BR": () => import("@/content/about/pt-BR.mdx"),
  "it-IT": () => import("@/content/about/it-IT.mdx"),
  "nl-NL": () => import("@/content/about/nl-NL.mdx"),
  "pl-PL": () => import("@/content/about/pl-PL.mdx"),
};

export function getAboutDocument(locale: Locale): Promise<AboutDocument> {
  return documents[locale]();
}
