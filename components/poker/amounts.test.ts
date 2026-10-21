import { expect, it } from "vitest";
import { formatAmount, formatChips, speakAmounts, defaultAmountLabels } from "./amounts";
const bb = (chips: number, blind: number | null = 100) => formatAmount(chips, "en-US", "bigBlinds", blind);
it("keeps chip formatting and locale separators", () => {
  expect(formatChips(1234567, "en-US")).toBe("1,234,567");
  expect(formatAmount(1234, "de-DE", "chips", 100)).toBe("1.234");
  expect(formatAmount(123450, "de-DE", "bigBlinds", 100)).toBe("1.234,5 BB");
  expect(formatAmount(75, "fi-FI", "bigBlinds", 100)).toBe("0,75 BB");
});
it("formats exact values, zeros, signed nets and no trailing zeros", () => {
  expect(bb(10000)).toBe("100 BB");
  expect(bb(250)).toBe("2.5 BB");
  expect(bb(75)).toBe("0.75 BB");
  expect(bb(0)).toBe("0 BB");
  expect(bb(-250)).toBe("-2.5 BB");
  expect(bb(-0)).toBe("0 BB");
  expect(bb(29, 100)).toBe("0.29 BB");
  expect(bb(Number.MAX_SAFE_INTEGER, 1)).toBe("9,007,199,254,740,991 BB");
});
it("marks every inexact conversion and preserves tiny gain/loss directions", () => {
  expect(bb(1, 3)).toBe("≈0.33 BB");
  expect(bb(2, 3)).toBe("≈0.67 BB");
  expect(bb(-1, 3)).toBe("≈-0.33 BB");
  expect(bb(101, 10000)).toBe("≈0.01 BB");
  expect(bb(1, 10000)).toBe("<0.01 BB");
  expect(bb(-1, 10000)).toBe("-<0.01 BB");
  expect(bb(1, 200)).toBe("<0.01 BB");
  expect(bb(3, 200)).toBe("≈0.02 BB");
});
it("labels chips explicitly when historical metadata is missing or invalid", () => {
  for (const blind of [undefined, null, 0, -1, NaN, 0.5, Infinity]) {
    expect(formatAmount(-1200, "en-US", "bigBlinds", blind)).toBe("-1,200 chips");
  }
});
it("expands localized units and approximation for assistive technology", () => {
  expect(formatAmount(-1, "en-US", "bigBlinds", 1000, defaultAmountLabels, true)).toBe("-less than 0.01 big blinds");
  expect(formatAmount(1, "en-US", "bigBlinds", 3, defaultAmountLabels, true)).toBe("approximately 0.33 big blinds");
  expect(speakAmounts("Call ≈0.33 BB", defaultAmountLabels)).toBe("Call approximately 0.33 big blinds");
  expect(speakAmounts("Lost <0.01 BB", defaultAmountLabels)).toBe("Lost less than 0.01 big blinds");
  expect(formatAmount(25, "fi-FI", "bigBlinds", 100, { ...defaultAmountLabels, bigBlinds: "isoa blindia" }, true)).toBe("0,25 isoa blindia");
});
