import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export type AmountDisplay = "chips" | "bigBlinds";
export const defaultAmountLabels = {
  chips: "chips", bigBlinds: "big blinds", approximately: "approximately {amount}", lessThan: "less than {amount}",
};
export type AmountLabels = { readonly [K in keyof typeof defaultAmountLabels]: string };
export function formatChips(value: number, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Presentation only. Integer arithmetic identifies rounding without floating-point drift. */
export function formatAmount(value: number, locale: Locale, mode: AmountDisplay, bigBlind?: number | null,
  labels: AmountLabels = defaultAmountLabels, accessible = false): string {
  if (mode === "chips") return formatChips(value, locale);
  if (bigBlind == null || !Number.isSafeInteger(bigBlind) || bigBlind <= 0) return `${formatChips(value, locale)} ${labels.chips}`;
  const magnitude = BigInt(Math.abs(value));
  const blind = BigInt(bigBlind);
  const hundredths = magnitude * 100n;
  const tiny = magnitude > 0n && hundredths < blind;
  const rounded = (hundredths + blind / 2n) / blind;
  const displayed = tiny ? 1n : rounded;
  const integer = new Intl.NumberFormat(locale).format(displayed / 100n);
  const fraction = Number(displayed % 100n);
  const decimal = new Intl.NumberFormat(locale).formatToParts(0.1).find(part => part.type === "decimal")?.value ?? ".";
  const numeric = fraction === 0 ? integer : `${integer}${decimal}${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
  const unit = accessible ? labels.bigBlinds : "BB";
  const amount = `${numeric} ${unit}`;
  const signed = (text: string) => value < 0 ? `-${text}` : text;
  if (tiny) return signed(accessible ? labels.lessThan.replace("{amount}", amount) : `<${amount}`);
  const result = signed(amount);
  return hundredths % blind === 0n ? result : accessible
    ? labels.approximately.replace("{amount}", result) : `≈${result}`;
}

/** Expand only numeric BB tokens, leaving player names and surrounding sentences intact. */
export function speakAmounts(text: string, labels: AmountLabels): string {
  return text.replace(/(≈)?(-)?(<)?([\d.,\u00a0\u202f ]+) BB/g,
    (_, approximate: string, negative: string, tiny: string, number: string) => {
      let amount = `${number} ${labels.bigBlinds}`;
      if (tiny) amount = labels.lessThan.replace("{amount}", amount);
      if (negative) amount = `-${amount}`;
      return approximate ? labels.approximately.replace("{amount}", amount) : amount;
    });
}
