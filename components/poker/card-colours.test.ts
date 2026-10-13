import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

function luminance(hex: string) {
  const channels = hex.match(/\w\w/g)!.map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
it("maintains 4.5:1 suit text contrast on card and Help backgrounds in both palettes", () => {
  const wrapper = readFileSync(new URL("./PokerApp.module.css", import.meta.url), "utf8");
  const colours = [...wrapper.matchAll(/--suit-\w+: (#\w{6})/g)].map(match => match[1]);
  expect(colours).toHaveLength(6);
  for (const colour of colours) for (const background of ["#fffdf6", "#f8f7f0"]) {
    expect((luminance(background) + 0.05) / (luminance(colour) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
