import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createUITable } from "./ui-fixtures";

for (const locale of ["en-US", "fi-FI"]) {
  for (const malformed of [false, true]) {
    test(`missing table ${locale} ${malformed ? "malformed" : "unknown"}`, { tag: "@ui-regression" }, async ({ page }) => {
      const prefix = locale === "en-US" ? "" : `/${locale}`;
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`${prefix}/game/${malformed ? "bad-invitation" : randomUUID()}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(locale === "en-US" ? "This table is no longer available" : "Tämä pöytä ei ole enää saatavilla");
      const lobby = page.getByRole("link", { name: locale === "en-US" ? "Lobby" : "Aula", exact: true });
      await expect(lobby).toHaveAttribute("href", `${prefix}/play`);
      await expect(page.getByRole("button")).toHaveCount(0);
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator("main img").evaluate(image => { if (image instanceof HTMLImageElement) return image.decode(); });
      mkdirSync("test-results/table-loading", { recursive: true });
      await page.screenshot({ path: `test-results/table-loading/missing-${locale}-${malformed ? "malformed" : "unknown"}.png`, fullPage: true });
      if (locale === "en-US" && !malformed) {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.screenshot({ path: "test-results/table-loading/missing-desktop.png", fullPage: true });
      }
      await lobby.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(`${prefix}/play`);
    });
  }
}

for (const locale of ["en-US", "fi-FI"]) {
  test(`table render retry refetches, survives repeated failure and preserves URL and identity (${locale})`, { tag: "@ui-regression" }, async ({ page }) => {
    test.skip(process.env.E2E_PRODUCTION !== "true", "Read failures are injected only into the isolated production test build.");
    const gameId = await createUITable(page);
    const marker = join(process.env.E2E_WORKSPACE!, `table-read-failure-${gameId}`);
    const cookies = await page.context().cookies();
    const mutations: string[] = [];
    page.on("request", request => { if (request.method() === "POST") mutations.push(request.url()); });
    writeFileSync(marker, "2");
    try {
      const prefix = locale === "en-US" ? "" : `/${locale}`;
      const url = `${prefix}/game/${gameId}?invitation=retained`;
      await page.goto(url);
      const heading = page.getByRole("heading", { name: locale === "en-US" ? "We couldn’t load this table" : "Pöydän lataaminen epäonnistui" });
      await expect(heading).toBeVisible();
      await expect(page.locator("main")).not.toContainText(/Controlled test-only|stack|database|digest/);
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
      await page.locator("main img").evaluate(image => { if (image instanceof HTMLImageElement) return image.decode(); });
      mkdirSync("test-results/table-loading", { recursive: true });
      await page.screenshot({ path: `test-results/table-loading/error-${locale}-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: `test-results/table-loading/error-${locale}-mobile.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const retry = page.getByRole("button", { name: locale === "en-US" ? "Try again" : "Yritä uudelleen", exact: true });
      await retry.focus();
      await page.keyboard.press("Enter");
      await expect(retry).toBeDisabled();
      await expect(retry).toBeEnabled();
      await expect(heading).toBeVisible();
      await expect(page).toHaveURL(url);
      await retry.focus();
      await page.keyboard.press("Space");
      await expect(heading).not.toBeVisible();
      await expect(page.getByRole("button", { name: locale === "en-US" ? "Start hand" : "Aloita käsi", exact: true })).toBeVisible();
      await expect(page).toHaveURL(url);
      expect((await page.context().cookies()).find(cookie => cookie.name === "ai-holdem-player-id")?.value).toBe(cookies.find(cookie => cookie.name === "ai-holdem-player-id")?.value);
      expect(mutations).toEqual([]);
    } finally {
      rmSync(marker, { force: true });
    }
  });

}
