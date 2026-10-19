import { expect, it } from "vitest";
import { parsePlayTab, playTabPath } from "./tabs";
import EnglishPlayPage from "@/app/(english)/play/page";
import { addLocalePrefix } from "@/lib/i18n";
it.each([undefined, "", "personal", "unknown", ["public"], ["public", "public"], ["shared", "public"]])("defaults invalid/repeated values to personal: %s", value => {
  expect(parsePlayTab(value)).toBe("personal");
});
it("preserves public/shared URLs and localization", () => {
  for (const tab of ["public", "shared"] as const) {
    expect(parsePlayTab(tab)).toBe(tab);
    expect(addLocalePrefix(playTabPath(tab), "en-US")).toBe(`/play?tab=${tab}`);
    expect(addLocalePrefix(playTabPath(tab), "fi-FI")).toBe(`/fi-FI/play?tab=${tab}`);
  }
  expect(playTabPath("personal")).toBe("/play");
});
it("forwards the original search promise through the English wrapper", () => {
  const searchParams = Promise.resolve({ tab: "shared" });
  const result = EnglishPlayPage({ params: Promise.resolve({}), searchParams });
  expect(result.props.children.props.searchParams).toBe(searchParams);
});
