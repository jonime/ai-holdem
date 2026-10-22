import { formatChips } from "./amounts";
import type { Locale } from "@/lib/i18n";

/** BB has already been summed per historical hand; never divide by today's blind. */
export function formatResultAmount(chips: number, bb: number, mode: "chips" | "bigBlinds", locale: Locale, chipLabel: string) {
  if (mode === "chips") return `${chips > 0 ? "+" : ""}${formatChips(chips, locale)} ${chipLabel}`;
  const magnitude = Math.abs(bb);
  if (magnitude > 0 && magnitude < 0.01) return `${bb < 0 ? "-" : "+"}<${new Intl.NumberFormat(locale).format(0.01)} BB`;
  const rounded = Math.round(magnitude * 100) / 100;
  const approximate = Math.abs(rounded - magnitude) > Number.EPSILON * Math.max(1, magnitude);
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(bb);
  return `${approximate ? "≈" : ""}${text} BB`;
}
