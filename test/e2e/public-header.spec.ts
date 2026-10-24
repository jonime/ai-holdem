import { expect, test } from "./fixtures";

for (const path of ["/", "/play?tab=shared"]) {
  test(`public header Help and Settings preserve focus and preferences on ${path}`, { tag: ["@ui-regression", "@compatibility"] }, async ({ page }, testInfo) => {
    await page.goto(path);
    const header = page.locator("header").first();
    const help = header.getByRole("button", { name: "Help", exact: true });
    const settings = header.getByRole("button", { name: "Settings", exact: true });
    await expect(help).toBeEnabled(); await expect(settings).toBeEnabled();
    await expect(header.getByRole("button").last()).toHaveAccessibleName(/^Appearance:/);
    await expect(header.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back", exact: true })).toHaveCount(0);
    await settings.click();
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(dialog.getByText(/game continues/)).toHaveCount(0);
    await dialog.getByRole("combobox", { name: "Card colours", exact: true }).selectOption("four-colour");
    await page.keyboard.press("Escape"); await expect(settings).toBeFocused();
    await help.click();
    const guide = page.getByRole("dialog", { name: "Game help", exact: true });
    await expect(guide.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await expect(guide.getByRole("heading", { name: "Hand rankings", exact: true })).toBeAttached();
    await guide.locator('nav a[href="#help-section-1"]').click();
    await expect(guide.getByRole("heading", { name: "Hand rankings", exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(path === "/" ? "/$" : "tab=shared$"));
    const suit = guide.locator('[data-suit="d"]').first();
    await expect(suit).toHaveCSS("color", "rgb(24, 86, 160)");
    await page.keyboard.press("Escape"); await expect(help).toBeFocused();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(help).toBeVisible(); await expect(settings).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`public-header-${width}.png`), fullPage: true });
    }
    await page.reload(); await settings.click();
    await expect(dialog.getByRole("combobox", { name: "Card colours", exact: true })).toHaveValue("four-colour");
    await dialog.getByRole("combobox", { name: "Language", exact: true }).selectOption("fi-FI");
    await expect(page).toHaveURL(path === "/" ? /\/fi-FI$/ : /\/fi-FI\/play\?tab=shared$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("header").getByRole("button", { name: "Asetukset", exact: true })).toBeEnabled();
  });
}

test("About uses its header brand as the home link", { tag: "@ui-regression" }, async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("navigation", { name: "About page navigation" })).toHaveCount(0);
  await expect(page.locator("article").getByRole("link", { name: /AI Hold/ })).toHaveCount(0);
  await page.locator("header").getByRole("link", { name: "AI Hold’em", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
