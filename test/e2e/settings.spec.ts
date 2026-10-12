import { expect, test, type Page } from "./fixtures";
import { createUITable } from "./ui-fixtures";
import type { Game } from "../../components/poker/types";
async function table(page: Page) {
  const id = await createUITable(page, true);
  const original: Game = (await (await page.request.get(`/api/games/${id}`)).json()).game;
  const human = original.poker.players.find(p => p.controller === "human")!;
  let game: Game = { ...original, poker: { ...original.poker, currentActorId: human.id,
    legalActions: [{ type: "fold" }, { type: "check" }, { type: "raise", minAmount: 200, maxAmount: 10000 }] } };
  await page.route(`**/api/games/${id}`, route => route.fulfill({ json: { game } }));
  await page.goto(`/game/${id}`);
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeEnabled();
  return { id, get: () => game, set: (next: Game) => { game = next; } };
}
async function open(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
}
test("Settings focus, scrolling, shortcuts, native controls and mobile layout", { tag: "@ui-regression" }, async ({ page }) => {
  await table(page);
  let actions = 0;
  await page.route("**/action", route => { actions++; return route.abort(); });
  await open(page);
  await page.keyboard.press("s"); expect(actions).toBe(0);
  await expect(page).toHaveTitle(/Your turn/);
  await page.screenshot({ path: test.info().outputPath("settings-desktop.png") });
  for (const key of ["Shift+Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "Tab"]) {
    await page.keyboard.press(key);
    expect(await page.getByRole("dialog").evaluate(d => d.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  }
  await page.getByRole("switch", { name: "Gameplay shortcuts", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeFocused();
  await expect(page.locator("[aria-keyshortcuts]")).toHaveCount(0);
  await expect(page.locator("kbd")).toHaveCount(0);
  await page.keyboard.press("s"); expect(actions).toBe(0);
  const slider = page.getByRole("slider"); const amount = page.getByRole("spinbutton", { name: "Bet amount", exact: true });
  await slider.focus(); await page.keyboard.press("ArrowRight"); await expect(amount).toHaveValue("201");
  await page.keyboard.press("Shift+ArrowRight"); await expect(amount).toHaveValue("202");
  await amount.fill("300"); await page.keyboard.press("q"); await expect(amount).toHaveValue("300");
  await open(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: test.info().outputPath("settings-mobile.png") });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const dialog = page.getByRole("dialog"); const rect = await dialog.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
  await page.getByRole("switch", { name: "Gameplay shortcuts", exact: true }).click();
  await page.keyboard.press("Escape"); await expect(slider).toHaveAttribute("aria-keyshortcuts", /Q E/);
  await slider.focus(); await page.keyboard.press("Shift+ArrowRight"); await expect(amount).toHaveValue("800");
  await page.reload(); await expect(slider).toHaveAttribute("aria-keyshortcuts", /Q E/);
  await open(page); await page.mouse.click(1,1); await expect(dialog).not.toBeVisible();
});
test("language keeps table, ownership, query and fragment, and English is unprefixed", { tag: ["@ui-regression", "@compatibility"] }, async ({ page }) => {
  const f = await table(page);
  const before = await page.context().cookies();
  await page.goto(`/game/${f.id}?test=settings#table`); await open(page);
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("fi-FI");
  await expect(page).toHaveURL(new RegExp(`/fi-FI/game/${f.id}\\?test=settings#table$`));
  await expect(page.getByRole("button", { name: "Asetukset", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await page.context().cookies()).find(c => c.name === "ai-holdem-player-id")?.value)
    .toBe(before.find(c => c.name === "ai-holdem-player-id")?.value);
  await expect(page.getByRole("button", { name: "Kippaa", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Asetukset", exact: true }).click();
  await page.getByRole("combobox", { name: "Kieli", exact: true }).selectOption("en-US");
  await expect(page).toHaveURL(new RegExp(`/game/${f.id}\\?test=settings#table$`));
  expect(new URL(page.url()).pathname).toBe(`/game/${f.id}`);
});
test("Settings stays usable during pending actions and failed recovery, with language blocked", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await table(page);
  await page.route(`**/api/games/${f.id}/action`, () => {});
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await open(page);
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeDisabled();
  await page.getByRole("switch", { name: "Gameplay shortcuts", exact: true }).click();
  await page.route(`**/api/games/${f.id}`, route => route.abort());
  await expect(page.getByRole("button", { name: "Refresh table", exact: true })).toBeAttached({ timeout: 20_000 });
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Turn sound", exact: true })).toBeEnabled();
});
test("storage changes synchronize without previews and game refresh continues in Settings", { tag: "@ui-regression" }, async ({ page }) => {
  await page.addInitScript(() => {
    const value = window as unknown as { audioAttempts: number; AudioContext: unknown };
    value.audioAttempts = 0;
    value.AudioContext = class { constructor() { value.audioAttempts++; throw new Error("No gesture"); } };
  });
  const f = await table(page); await open(page);
  const other = await page.context().newPage();
  await other.goto(`/game/${f.id}`);
  await other.evaluate(() => localStorage.setItem("ai-holdem-settings", JSON.stringify({ version: 1, turnSound: true, gameplayShortcuts: false })));
  await page.evaluate(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: "ai-holdem-settings", newValue: JSON.stringify({ version: 1, turnSound: true, gameplayShortcuts: false }), storageArea: localStorage }));
  });
  await expect(page.getByRole("switch", { name: "Turn sound", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Gameplay shortcuts", exact: true })).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => (window as unknown as { audioAttempts: number }).audioAttempts)).toBe(0);
  f.set({ ...f.get(), version: f.get().version + 1, poker: { ...f.get().poker, handNumber: 42 } });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Hand 42", { exact: true })).toBeAttached();
  await expect(page.getByRole("dialog")).toBeVisible();
  await other.evaluate(() => localStorage.removeItem("ai-holdem-settings"));
  await other.close();
  await expect(page.getByRole("switch", { name: "Turn sound", exact: true })).toHaveAttribute("aria-checked", "false");
});

test("language waits for bot advancement and replay creation", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await table(page);
  let steps = 0;
  await page.route(`**/api/games/${f.id}/step`, () => { steps++; });
  const bot = f.get().poker.players.find(p => p.controller === "bot")!;
  f.set({ ...f.get(), version: f.get().version + 1, poker: { ...f.get().poker, currentActorId: bot.id } });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => steps).toBe(1);
  await open(page); await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Gameplay shortcuts", exact: true })).toBeEnabled();
  // A fresh visit fences the pending advancement before rendering a finished table.
  const human = f.get().poker.players.find(p => p.controller === "human")!;
  f.set({ ...f.get(), status: "complete", poker: { ...f.get().poker, street: "complete", currentActorId: null,
    legalActions: [], players: f.get().poker.players.map(p => ({ ...p, stack: p.id === human.id ? 0 : p.stack })) } });
  await page.reload();
  let creations = 0;
  await page.route("**/quick-game", () => { creations++; });
  await page.getByRole("button", { name: "New Quick Play", exact: true }).click();
  await expect.poll(() => creations).toBe(1);
  await open(page); await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeDisabled();
});
