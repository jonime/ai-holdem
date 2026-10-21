import { completed } from "./replay-fixtures";
import { expect, test } from "./fixtures";

for (const entry of ["in-game", "shared"] as const) {
  test(`${entry} replay playback preserves focus, timing and preferences and pauses under overlays`, { tag: "@ui-regression" }, async ({ page, browser }) => {
    const f = await completed(browser, page);
    try {
      if (entry === "shared") {
        const response = await page.request.post(`/api/games/${f.id}/hands/1/share`, { headers: { origin: new URL(page.url()).origin } });
        expect(response.ok()).toBe(true);
        const { share } = await response.json();
        await page.goto(`/replay/${share.token}`);
      } else {
        await page.getByRole("complementary", { name: "Actions" }).getByRole("button", { name: "Review", exact: true }).last().click();
      }
      const frame = page.locator("[data-replay-frame]");
      const button = (name: string) => page.getByRole("button", { name, exact: true });
      await expect(frame).toHaveAttribute("data-replay-frame", "0");
      await expect(button("Play")).toBeVisible();
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.clock.fastForward(5000);
      await expect(frame).toHaveAttribute("data-replay-frame", "0");
      await button("Play").click();
      await expect(button("Pause")).toBeFocused();
      await page.clock.fastForward(1500);
      await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
        key: "ai-holdem-settings", storageArea: localStorage,
        newValue: JSON.stringify({ version: 1, turnSound: false, gameplayShortcuts: true, cardColours: "four-colour", amountDisplay: "bigBlinds", showCurrentHand: true }),
      })));
      await expect(page.locator('[data-card-colours="four-colour"]').first()).toBeVisible();
      await expect(button("Pause")).toBeFocused();
      await page.clock.fastForward(499);
      await expect(frame).toHaveAttribute("data-replay-frame", "0");
      await page.clock.fastForward(1);
      await expect(frame).toHaveAttribute("data-replay-frame", "1");
      await expect(button("Pause")).toBeFocused();
      await page.clock.fastForward(1200);
      await expect(button("Replay")).toBeFocused();
      await expect(button("Next")).toBeDisabled();
      await button("Replay").press("Enter");
      await expect(frame).toHaveAttribute("data-replay-frame", "0");
      await expect(button("Pause")).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(button("Play")).toBeVisible();
      await page.clock.fastForward(5000);
      await expect(frame).toHaveAttribute("data-replay-frame", "1");
      await button("Previous").click();
      await button("Play").click();
      if (entry === "in-game") {
        await button("Share hand").click();
        await expect(page.getByRole("dialog", { name: "Share replay - Hand 1", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
      } else {
        // Standalone pages have no built-in overlays; exercise a native modal above it.
        await page.evaluate(() => {
          const dialog = document.createElement("dialog"); dialog.id = "playback-overlay";
          document.body.append(dialog); dialog.showModal();
        });
        await expect(button("Play")).toHaveCount(1);
        await page.evaluate(() => document.querySelector("#playback-overlay")!.remove());
      }
      await expect(button("Play")).toBeVisible();
      await page.clock.fastForward(5000);
      await expect(frame).toHaveAttribute("data-replay-frame", "0");
      await button("Play").click();
      await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
      await expect(button("Play")).toBeVisible();
      await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
      await page.clock.fastForward(5000);
      await expect(frame).toHaveAttribute("data-replay-frame", "0");
      await page.setViewportSize({ width: 375, height: 812 });
      const controls = await Promise.all(["Previous", "Play", "Next"].map(async name => (await button(name).boundingBox())!));
      expect(controls.every(rect => Math.abs(rect.y - controls[0].y) <= 1 && rect.x >= 0 && rect.x + rect.width <= 375)).toBe(true);
      expect(controls[0].x).toBeLessThan(controls[1].x); expect(controls[1].x).toBeLessThan(controls[2].x);
      await page.screenshot({ path: test.info().outputPath(`${entry}-playback-mobile.png`) });
      await button("Play").click();
      if (entry === "in-game") {
        await page.setViewportSize({ width: 1280, height: 720 });
        await button("Close").click();
        await page.getByRole("complementary", { name: "Actions" }).getByRole("button", { name: "Review", exact: true }).last().click();
        await expect(button("Play")).toBeVisible();
        await page.clock.fastForward(5000);
        await expect(frame).toHaveAttribute("data-replay-frame", "0");
      } else {
        const path = new URL(page.url()).pathname;
        await page.clock.resume();
        await page.goto(`/fi-FI${path}`);
        await expect(button("Toista")).toBeVisible();
        await button("Toista").click(); await expect(button("Tauko")).toBeFocused();
        await button("Tulos").click(); await expect(button("Toista uudelleen")).toBeVisible();
        const localizedControls = await Promise.all(["Edellinen", "Toista uudelleen", "Seuraava"].map(async name => (await button(name).boundingBox())!));
        expect(localizedControls.every(rect => Math.abs(rect.y - localizedControls[0].y) <= 1 && rect.x >= 0 && rect.x + rect.width <= 375)).toBe(true);
      }
    } finally { await f.guestContext.close(); }
  });
}
