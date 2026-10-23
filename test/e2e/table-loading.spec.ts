import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Game } from "../../components/poker/types";
import { expect, test } from "./fixtures";
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
      await expect(page.locator("main").getByRole("button")).toHaveCount(0);
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator("main img").evaluate(image => { if (image instanceof HTMLImageElement) return image.decode(); });
      mkdirSync("test-results/table-loading", { recursive: true });
      await page.screenshot({ path: test.info().outputPath(`table-loading/missing-${locale}-${malformed ? "malformed" : "unknown"}.png`), fullPage: true });
      if (locale === "en-US" && !malformed) {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.screenshot({ path: test.info().outputPath("table-loading/missing-desktop.png"), fullPage: true });
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
      await page.screenshot({ path: test.info().outputPath(`table-loading/error-${locale}-desktop.png`), fullPage: true });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: test.info().outputPath(`table-loading/error-${locale}-mobile.png`), fullPage: true });
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

for (const locale of ["en-US", "fi-FI"]) {
  for (const mobile of [false, true]) {
    for (const destination of ["waiting", "active", "completed"]) {
      for (const preference of mobile ? ["false"] : [null, "true", "false"]) {
        test(`neutral loading table ${locale} ${mobile ? "mobile navigation" : "desktop direct"} to ${destination} Actions ${preference ?? "default"}`, { tag: "@ui-regression" }, async ({ page }) => {
          test.skip(process.env.E2E_PRODUCTION !== "true", "Server delay uses the isolated production build.");
          test.setTimeout(60_000);
          await page.setViewportSize({ width: mobile ? 375 : 1280, height: mobile ? 812 : 900 });
          await page.emulateMedia({ reducedMotion: mobile ? "reduce" : "no-preference" });
          await page.addInitScript(preference => {
            if (preference === null) localStorage.removeItem("ai-holdem-feed-collapsed");
            else localStorage.setItem("ai-holdem-feed-collapsed", preference);
            const widths: number[] = [];
            Object.assign(window, { loadingTableWidths: widths });
            function sample() {
              const table = document.querySelector('[class*="tableShell"]');
              if (table) widths.push(table.getBoundingClientRect().width);
              requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
          }, preference);
          const prefix = locale === "en-US" ? "" : `/${locale}`;
          const gameId = await createUITable(page, destination !== "waiting");
          if (destination === "completed") {
            for (let turns = 0; turns < 100; turns++) {
              const game: Game = (await (await page.request.get(`/api/games/${gameId}`)).json()).game;
              if (game.poker.street === "complete") break;
              const human = game.poker.players.find(p => p.id === game.poker.currentActorId)?.controller === "human";
              const response = await page.request.post(`/api/games/${gameId}/${human ? "action" : "step"}`, {
                data: { expectedVersion: game.version, ...(human ? { action: { type: "fold" } } : {}) },
              });
              expect(response.ok()).toBe(true);
            }
            expect((await (await page.request.get(`/api/games/${gameId}`)).json()).game.poker.street).toBe("complete");
          }
          const marker = join(process.env.E2E_WORKSPACE!, `table-read-delay-${gameId}`);
          writeFileSync(marker, "delay");
          let release!: () => void;
          let pending = new Promise<void>(resolve => { release = resolve; });
          let browserReadStarted = false;
          await page.route(`**/api/games/${gameId}`, async route => {
            if (route.request().method() !== "GET") return route.continue();
            browserReadStarted = true;
            await pending;
            await route.continue();
          });
          const shell = page.getByTestId("table-loading-shell");
          const label = locale === "en-US" ? "Loading table…" : "Ladataan pöytää…";
          const assertNeutral = async () => {
            await expect(shell).toBeVisible();
            await expect(shell.getByRole("status")).toHaveText(label);
            await expect(shell.locator('button, input, [data-playing-card], article')).toHaveCount(0);
            await expect(shell).not.toContainText(/Player|Seat|Equity|[0-9]/);
            await expect(page.getByRole("complementary")).toHaveCount(0);
            await expect(page.locator('[class*="felt"], [class*="tableShell"], [class*="actionTray"], [class*="feedColumn"]')).toHaveCount(0);
            await expect(shell.getByRole("status")).toHaveAttribute("aria-live", "polite");
            const animation = await shell.locator('[class*="spinner"]').evaluate(n => getComputedStyle(n).animationName);
            if (mobile) expect(animation).toBe("none");
            else expect(animation).toMatch(/spin/);
            const status = await shell.getByRole("status").boundingBox();
            const header = await page.locator("header:visible").boundingBox();
            expect(Math.abs(status!.y + status!.height / 2 - (header!.y + header!.height + (mobile ? 812 : 900)) / 2)).toBeLessThan(12);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          };
          try {
            if (mobile) {
              await page.goto(`${prefix}/play`);
              await page.locator(`a[href="${prefix}/game/${gameId}"]`).first().click();
            } else {
              await page.goto(`${prefix}/game/${gameId}`, { waitUntil: "commit" });
            }
            await assertNeutral();
            await expect(page.getByRole("link", { name: "AI Hold'em", exact: true })).toBeVisible();
            expect(browserReadStarted).toBe(false);
            await expect(page.locator("header").getByRole("button")).toHaveCount(0);
            const serverGeometry = await shell.boundingBox();
            await page.screenshot({ path: test.info().outputPath("server-loading.png"), fullPage: true });
            rmSync(marker, { force: true });
            await expect.poll(() => browserReadStarted).toBe(true);
            await assertNeutral();
            await expect(page.getByRole("button", { name: locale === "en-US" ? "Help" : "Ohje", exact: true })).toBeEnabled();
            expect(await shell.boundingBox()).toEqual(serverGeometry);
            await page.screenshot({ path: test.info().outputPath("browser-loading.png"), fullPage: true });
            release();
            await expect(shell).toHaveCount(0);
            if (destination === "waiting") {
              await expect(page.getByRole("button", { name: locale === "en-US" ? "Start hand" : "Aloita käsi", exact: true })).toBeVisible();
            } else {
              await expect(page.locator('[class*="tableShell"]').first()).toBeVisible();
              await expect(page.locator("[data-playing-card]:visible").first()).toBeVisible();
              await expect(page.getByRole("dialog")).toHaveCount(0);
              const actions = page.getByRole("complementary");
              if (mobile || preference === "true") await expect(actions).toBeHidden();
              else await expect(actions).toBeVisible();
              const width = await page.locator('[class*="tableShell"]').first().evaluate(n => n.getBoundingClientRect().width);
              await expect.poll(() => page.evaluate(() => (Reflect.get(window, "loadingTableWidths") as number[]).length)).toBeGreaterThan(0);
              const widths = await page.evaluate(() => Reflect.get(window, "loadingTableWidths") as number[]);
              expect(widths.every(sample => Math.abs(sample - width) < 1)).toBe(true);
              if (destination === "completed") await expect(page.locator("[data-hand-result]")).toBeVisible();
            }
            if (locale === "en-US" && !mobile && preference === null) {
              browserReadStarted = false;
              pending = new Promise<void>(resolve => { release = resolve; });
              await page.evaluate(() => window.dispatchEvent(new Event("focus")));
              await expect.poll(() => browserReadStarted).toBe(true);
              await expect(shell).toHaveCount(0);
              if (destination === "waiting") {
                await expect(page.getByRole("button", { name: "Start hand", exact: true })).toBeVisible();
              } else {
                await expect(page.locator('[class*="tableShell"]').first()).toBeVisible();
                await expect(page.getByRole("complementary")).toBeVisible();
              }
              release();
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          } finally {
            rmSync(marker, { force: true });
            release();
          }
        });
      }
    }
  }
}
