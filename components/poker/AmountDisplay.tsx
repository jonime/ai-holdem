"use client";
import { createContext, useContext } from "react";
import { useI18n } from "./I18nProvider";
import { formatAmount, speakAmounts, type AmountDisplay } from "./amounts";

const AmountContext = createContext<{ mode: AmountDisplay; bigBlind?: number }>({ mode: "chips" });
export const AmountDisplayProvider = AmountContext.Provider;
export function useAmounts(historicalBlind?: number | null) {
  const context = useContext(AmountContext);
  const { locale, dictionary } = useI18n();
  const blind = historicalBlind === undefined ? context.bigBlind : historicalBlind;
  return {
    mode: context.mode,
    format: (value: number) => formatAmount(value, locale, context.mode, blind, dictionary.amounts),
    spoken: (value: number) => formatAmount(value, locale, context.mode, blind, dictionary.amounts, true),
  };
}
/** Keep concise visual units while spelling them out for assistive technology. */
export function AmountText({ children }: { children: string }) {
  const { dictionary } = useI18n();
  if (!children.includes(" BB")) return children;
  const spoken = speakAmounts(children, dictionary.amounts);
  return <><span aria-hidden="true">{children}</span><span className="sr-only">{spoken}</span></>;
}
