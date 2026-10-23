import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { parseThemePreference, resolveTheme, THEME_INITIALIZATION } from "./preference";
describe("appearance preference", () => {
  it("accepts only supported preferences", () => {
    for (const value of [null, undefined, "", "LIGHT", "auto", {}, "system"]) expect(parseThemePreference(value)).toBe("system");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
  });
  it("follows the device only in System mode", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it.each([null, "system", "invalid", "light", "dark"])("initializes before paint for %s", value => {
    for (const dark of [true, false]) {
      const document = { documentElement: { dataset: { theme: "" } } };
      runInNewContext(THEME_INITIALIZATION, { document, localStorage: { getItem: () => value }, matchMedia: () => ({ matches: dark }) });
      expect(document.documentElement.dataset.theme).toBe(resolveTheme(parseThemePreference(value), dark));
    }
  });
  it("initializes with unavailable storage", () => {
    const document = { documentElement: { dataset: { theme: "" } } };
    runInNewContext(THEME_INITIALIZATION, { document, get localStorage() { throw Error("blocked"); }, matchMedia: () => ({ matches: true }) });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
