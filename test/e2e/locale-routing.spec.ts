import { expect, test } from "@playwright/test";

test("@smoke English URLs stay unprefixed and language changes are explicit", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "Accept-Language": "fi-FI,fi;q=0.9" });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https?:\/\/[^/]+\/?$/);
  await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute("href", /^https?:\/\/[^/]+\/?$/);
  await expect(page.locator('form[action="/quick-game"]')).toBeVisible();

  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/about$/);

  await page.getByRole("button", { name: "Language: English", exact: true }).click();
  await page.getByRole("link", { name: "Suomi", exact: true }).click();
  await expect(page).toHaveURL(/\/fi-FI\/about$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fi-FI");
  await page.getByRole("button", { name: "Kieli: Suomi", exact: true }).click();
  await page.getByRole("link", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");

  const legacy = await page.request.get("/en-US/about?source=old", { maxRedirects: 0 });
  expect(legacy.status()).toBe(308);
  expect(new URL(legacy.headers().location, legacy.url()).pathname).toBe("/about");
  expect(new URL(legacy.headers().location, legacy.url()).search).toBe("?source=old");
  const unknown = await page.request.get("/ja-JP/about");
  expect(unknown.status()).toBe(404);
  const sitemap = await page.request.get("/sitemap.xml");
  expect(await sitemap.text()).not.toContain("/en-US");
});
