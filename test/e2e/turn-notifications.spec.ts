import { expect, test, type Page } from "@playwright/test";
import { createUITable } from "./ui-fixtures";
import type { Game } from "../../components/poker/types";

async function controlledTable(page: Page) {
  const id = await createUITable(page, true);
  const original: Game = (await (await page.request.get(`/api/games/${id}`)).json()).game;
  const human = original.poker.players.find(p => p.controller === "human")!;
  let game: Game = { ...original, poker: { ...original.poker, currentActorId: human.id, legalActions: [{ type: "fold" }, { type: "check" }] } };
  await page.route(`**/api/games/${id}`, route => route.fulfill({ json: { game } }));
  await page.goto(`/game/${id}`);
  await expect(page).toHaveTitle("🟢 Your turn · AI Hold’em");
  return { id, get: () => game, set: (next: Game) => { game = next; } };
}
async function refresh(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}
async function counts(page: Page) { return page.evaluate(() => (window as unknown as { notes: number }).notes); }

test("turn title, cue counts, persisted accessible toggle and mobile header", { tag: "@ui-regression" }, async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { notes: number; AudioContext: unknown };
    w.notes = 0;
    w.AudioContext = class {
      state = "suspended"; currentTime = 0; destination = {};
      async resume() { this.state = "running"; }
      async close() { this.state = "closed"; }
      createOscillator() { return { frequency: { value: 0 }, connect() {}, disconnect() {}, start() { w.notes++; }, stop() {} }; }
      createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    };
  });
  const f = await controlledTable(page);
  const toggle = page.getByRole("switch", { name: "Turn sound", exact: true });
  expect(await counts(page)).toBe(0);
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.focus(); await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(await counts(page)).toBe(2);
  // Actions is a modal at mobile sizes and never invalidates the underlying turn.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: /actions panel/i }).click();
  await expect(page).toHaveTitle("🟢 Your turn · AI Hold’em");
  await page.keyboard.press("Escape");
  const header = page.locator("header");
  const bounds = await header.boundingBox(); const button = await toggle.boundingBox();
  expect(bounds).not.toBeNull(); expect(button).not.toBeNull();
  expect(button!.x + button!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  f.set({ ...f.get(), version: f.get().version + 1 }); await refresh(page);
  await expect.poll(() => counts(page)).toBe(2);
  f.set({ ...f.get(), version: f.get().version + 1, poker: { ...f.get().poker, handNumber: f.get().poker.handNumber + 1 } });
  await refresh(page); await expect.poll(() => counts(page)).toBe(4);
  await page.reload(); await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page).toHaveTitle("🟢 Your turn · AI Hold’em"); expect(await counts(page)).toBe(0);
  f.set({ ...f.get(), version: f.get().version + 1, poker: { ...f.get().poker, legalActions: [] } });
  await refresh(page); await expect(page).not.toHaveTitle(/Your turn/);
  await page.screenshot({ path: "test-results/turn-notifications-mobile.png", fullPage: true });
  await page.goto("/play"); await expect(page).not.toHaveTitle(/Your turn/);
});

test("spectators never receive the turn title", { tag: "@ui-regression" }, async ({ page, browser }) => {
  const f = await controlledTable(page);
  const context = await browser.newContext();
  try {
    const spectator = await context.newPage(); await spectator.goto(`/game/${f.id}`);
    await expect(spectator.getByRole("switch", { name: "Turn sound", exact: true })).toBeVisible();
    await expect(spectator).not.toHaveTitle(/Your turn/);
  } finally { await context.close(); }
});
