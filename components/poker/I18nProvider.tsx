"use client";

import { createContext, useContext } from "react";

import type { Locale } from "@/lib/i18n";
import type { GameDictionary } from "@/lib/i18n/types";

type TranslationValue = string | number;
type TranslationKey = string;

/**
 * Route-scoped provider for the game route (`/[lang]/game/[gameId]`), which
 * serves the combined lobby/table/history/feed/cards/errors dictionary to
 * its client components. The landing page deliberately has no provider and
 * receives narrow string props instead.
 */

function lookup(dictionary: GameDictionary, key: TranslationKey): string {
  const value = key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
  return typeof value === "string" ? value : key;
}

function interpolate(value: string, values?: Readonly<Record<string, TranslationValue>>): string {
  if (!values) return value;
  return value.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

export type I18nContextValue = {
  readonly locale: Locale;
  readonly dictionary: GameDictionary;
  readonly t: (key: TranslationKey, values?: Readonly<Record<string, TranslationValue>>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  dictionary,
  children,
}: Omit<I18nContextValue, "t"> & { readonly children: React.ReactNode }) {
  const t = (key: TranslationKey, values?: Readonly<Record<string, TranslationValue>>) =>
    interpolate(lookup(dictionary, key), values);
  return <I18nContext.Provider value={{ locale, dictionary, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}