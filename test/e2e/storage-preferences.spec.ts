import { expect, test, type Page } from "./fixtures";
import { createUITable } from "./ui-fixtures";
import type { Game } from "../../components/poker/types";

// Vercel's optional telemetry script is absent from a local Next server.
test.beforeEach(async ({ page }) => {
  await page.route("**/_vercel/speed-insights/script.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
});

async function actionsTable(page: Page) {
  const id = await createUITable(page, true);
  const original: Game = (await (await page.request.get(`/api/games/${id}`)).json()).game;
  const human = original.poker.players.find(player => player.controller === "human")!;
  const game = { ...original, poker: { ...original.poker, currentActorId: human.id, legalActions: [{ type: "check" }] } };
  await page.route(`**/api/games/${id}`, route => route.fulfill({ json: { game } }));
  await page.goto(`/game/${id}`);
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeEnabled();
}
for (const failure of ["access", "read", "write"] as const) {
  test(`optional storage ${failure} failures keep Play, names and Actions usable`, { tag: "@ui-regression" }, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.addInitScript(mode => {
      if (mode === "access") Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Unavailable", "SecurityError"); } });
      else {
        const storage = window.localStorage;
        const method = mode === "read" ? "getItem" : "setItem";
        const original = Storage.prototype[method];
        Object.defineProperty(Storage.prototype, method, { value: function(this: Storage, ...args: string[]) {
          if (this === storage) throw new DOMException("Unavailable", "QuotaExceededError");
          return Reflect.apply(original, this, args);
        } });
      }
    }, failure);
    await page.goto("/play");
    const name = page.locator('input[name="hostName"]');
    await expect(name).toBeVisible(); await name.fill("Ada"); await expect(name).toHaveValue("Ada");
    await actionsTable(page);
    const panel = page.getByRole("complementary", { name: "Actions", exact: true });
    await expect(panel).toBeVisible();
    await page.getByRole("button", { name: "Collapse actions panel" }).click(); await expect(panel).toHaveCount(0);
    await page.getByRole("button", { name: "Expand actions panel" }).click(); await expect(panel).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 }); await page.reload();
    const dialog = page.getByRole("dialog", { name: "Actions", exact: true });
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Expand actions panel" }).click(); await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close actions panel" }).click(); await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Expand actions panel" }).click(); await expect(dialog).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("name and Actions persist across reloads without hydration errors", { tag: "@ui-regression" }, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/play");
  const name = page.locator('input[name="hostName"]'); await name.fill("Remembered");
  await page.reload(); await expect(name).toHaveValue("Remembered");
  await actionsTable(page);
  await page.getByRole("button", { name: "Collapse actions panel" }).click();
  await page.reload(); await expect(page.getByRole("button", { name: "Expand actions panel" })).toBeVisible();
  await page.getByRole("button", { name: "Expand actions panel" }).click();
  await page.reload(); await expect(page.getByRole("complementary", { name: "Actions", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("background preferred names preserve server seat names and active drafts", { tag: "@ui-regression" }, async ({ page }) => {
  const id = await createUITable(page);
  await page.goto(`/game/${id}`);
  const name = page.getByRole("textbox", { name: "Your name" });
  await expect(name).toHaveValue("Player 1");
  const update = (value: string | null) => page.evaluate(newValue => window.dispatchEvent(new StorageEvent("storage", { key: "ai-holdem-player-name", newValue, storageArea: window.localStorage })), value);
  await update("Background"); await expect(name).toHaveValue("Player 1");
  await name.fill("Draft"); await update("Another tab"); await expect(name).toHaveValue("Draft");
  await update(null); await expect(name).toHaveValue("Draft");
});
