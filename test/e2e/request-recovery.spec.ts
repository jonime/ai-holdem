import { expect, test, type Page } from "@playwright/test";
import { createUITable } from "./ui-fixtures";
import type { Game } from "../../components/poker/types";

async function table(page: Page) {
  const id = await createUITable(page, true);
  let original: Game = (await (await page.request.get(`/api/games/${id}`)).json()).game;
  for (let turns = 0; turns < 30 && original.poker.players.find(p => p.id === original.poker.currentActorId)?.controller === "bot"; turns++) {
    const response = await page.request.post(`/api/games/${id}/step`, { data: { expectedVersion: original.version } });
    expect(response.ok()).toBe(true);
    original = (await response.json()).game;
  }
  const human = original.poker.players.find(p => p.controller === "human")!;
  let game: Game = { ...original, poker: { ...original.poker, currentActorId: human.id, legalActions: [{ type: "fold" }, { type: "check" }] } };
  let failRead = false;
  await page.route(`**/api/games/${id}`, route => failRead ? route.abort("failed") : route.fulfill({ json: { game } }));
  await page.goto(`/game/${id}`);
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeEnabled();
  return { id, game: () => game, set: (next: Game) => { game = next; }, failRead: (value: boolean) => { failRead = value; } };
}

test("stalled action reconciles once without duplicate click or keyboard submission", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await table(page);
  let submissions = 0;
  await page.route(`**/api/games/${f.id}/action`, async () => { submissions++; });
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.keyboard.press("d");
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeDisabled();
  await expect(page.locator("main").getByRole("alert")).toContainText("Check the table before trying again", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeEnabled();
  expect(submissions).toBe(1);
  await page.screenshot({ path: "test-results/recovery-reconciled.png", fullPage: true });
});

test("committed action with lost response shows authoritative progress without resubmission", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await table(page);
  let submissions = 0;
  await page.route(`**/api/games/${f.id}/action`, async route => {
    submissions++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    f.set((await response.json()).game);
    await route.abort("failed");
  });
  // Fold is legal for the real persisted human turn as well as the controlled view.
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Check the table before trying again");
  expect(submissions).toBe(1);
});

test("seat departure blocks mutations after failed recovery and remains on the table", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await table(page);
  let submissions = 0;
  await page.route(`**/api/games/${f.id}/seats/*/release`, async route => {
    submissions++; f.failRead(true); await route.abort("failed");
  });
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Leave table", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh table", exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/game/${f.id}$`));
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeDisabled();
  await page.screenshot({ path: "test-results/recovery-refresh-table.png", fullPage: true });
  f.failRead(false);
  await page.getByRole("button", { name: "Refresh table", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeEnabled();
  expect(submissions).toBe(1);
});

test("navigation cancels pending work and late responses cannot affect another table", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await table(page);
  let submissions = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/games/${f.id}/action`, async route => {
    submissions++; await held;
    await route.fulfill({ json: { game: f.game() } }).catch(() => {});
  });
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect.poll(() => submissions).toBe(1);
  await page.getByRole("link", { name: "AI Hold'em", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  release();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(submissions).toBe(1);
});
