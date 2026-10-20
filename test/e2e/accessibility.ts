import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "./fixtures";

/** No exclusions or baselines: selected WCAG A/AA rules fail the fixture. */
export async function scanAccessibility(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  await test.info().attach(`accessibility-${name}`, {
    body: JSON.stringify(results, null, 2), contentType: "application/json",
  });
  expect(results.violations, name).toEqual([]);
}
