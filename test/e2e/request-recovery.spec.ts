import { expect, test, type Page } from "./fixtures";
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
  await page.screenshot({ path: test.info().outputPath("recovery-reconciled.png"), fullPage: true });
});

test("committed action with lost response shows authoritative progress without resubmission", { tag: ["@ui-regression", "@compatibility"] }, async ({ page }) => {
  const f = await table(page);
  // Reconciliation reads the actual persisted state, not the controlled initial view.
  await page.unroute(`**/api/games/${f.id}`);
  let submissions = 0;
  await page.route(`**/api/games/${f.id}/action`, async route => {
    submissions++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    f.set((await response.json()).game);
    await route.abort("failed");
  });
  const originalVersion = f.game().version;
  const reconciled = page.waitForResponse(async r =>
    new URL(r.url()).pathname === `/api/games/${f.id}` && r.request().method() === "GET" &&
    (await r.json()).game.version > originalVersion);
  // Fold is legal for the real persisted human turn as well as the controlled view.
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  const authoritative = (await (await reconciled).json()).game;
  expect(authoritative.version).toBeGreaterThan(originalVersion);
  expect(authoritative.poker.players.find((p: { controller: string }) => p.controller === "human").folded).toBe(true);
  await expect(page.locator("main").getByRole("alert")).toContainText("Check the table before trying again");
  await expect(page.getByRole("button", { name: "Fold", exact: true }).and(page.locator(":enabled"))).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Fold", exact: true }).and(page.locator(":enabled"))).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: "Refresh table", exact: true })).toHaveCount(1);
  await expect(page.locator("main").getByRole("alert")).toContainText("We couldn’t confirm your action or refresh the table.");
  await expect(page.getByTestId("connection-status")).toHaveText("");
  await page.context().setOffline(true);
  await expect(page.getByTestId("connection-status")).toContainText("You’re offline.");
  await expect(page.getByRole("button", { name: "Refresh table", exact: true })).toBeDisabled();
  await expect(page.locator("main").getByRole("alert")).toContainText("We couldn’t confirm your action");
  await page.screenshot({ path: test.info().outputPath("recovery-refresh-table.png"), fullPage: true });
  const onlineRead = page.waitForEvent("requestfailed", request => new URL(request.url()).pathname === `/api/games/${f.id}`);
  await page.context().setOffline(false);
  await onlineRead;
  await expect(page.getByTestId("connection-status")).toHaveText("");
  await expect(page.getByRole("button", { name: "Refresh table", exact: true })).toBeEnabled();
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

for (const width of [1280, 390]) {
  test(`connection notices recover quietly at ${width}px`, { tag: "@ui-regression" }, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const f = await table(page);
    const status = page.getByTestId("connection-status");
    await expect(status).toHaveText("");
    await page.context().setOffline(true);
    await expect(status).toContainText("You’re offline.");
    await page.screenshot({ path: test.info().outputPath(`connection-offline-${width}.png`), fullPage: true });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/games/${f.id}`, async route => {
      await held; await route.fulfill({ json: { game: f.game() } });
    });
    await page.context().setOffline(false);
    await expect(status).toContainText("Connection restored. Updating the table…");
    await page.screenshot({ path: test.info().outputPath(`connection-reconnecting-${width}.png`), fullPage: true });
    release();
    await expect(status).toHaveText("");
    await page.unroute(`**/api/games/${f.id}`);
    let fail = true;
    let reads = 0;
    let finish!: () => void;
    const retry = new Promise<void>(resolve => { finish = resolve; });
    await page.route(`**/api/games/${f.id}`, async route => {
      reads++;
      if (fail) return route.abort("failed");
      await retry; await route.fulfill({ json: { game: f.game() } });
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(status).toContainText("Unable to update the table. Displayed information may be out of date.");
    const refresh = page.getByRole("button", { name: "Refresh table", exact: true });
    await expect(refresh).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Retry bot", exact: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`connection-failed-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    fail = false;
    const before = reads;
    await refresh.focus(); await page.keyboard.press("Enter");
    await expect(refresh).toBeDisabled();
    await refresh.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    expect(reads).toBe(before + 1);
    await expect(status).toContainText("Unable to update the table.");
    finish();
    await expect(status).toHaveText("");
    await expect(refresh).toHaveCount(0);
  });
}

test("blocked WebSockets with healthy polling have no connection notice", { tag: "@ui-regression" }, async ({ page }) => {
  await page.routeWebSocket(/\/realtime\//, socket => socket.close());
  await page.clock.install();
  const f = await table(page);
  let reads = 0;
  await page.route(`**/api/games/${f.id}`, route => { reads++; return route.fulfill({ json: { game: f.game() } }); });
  await page.clock.fastForward(5_100);
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(page.getByTestId("connection-status")).toHaveText("");
  await expect(page.getByRole("button", { name: "Refresh table", exact: true })).toHaveCount(0);
});

test("waiting lobby shares the localized quiet connection notice", { tag: "@ui-regression" }, async ({ page }) => {
  const id = await createUITable(page);
  await page.goto(`/fi-FI/game/${id}`);
  await expect(page.getByRole("button", { name: "Aloita käsi", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Päivitä pöytä", exact: true })).toHaveCount(0);
  await page.context().setOffline(true);
  await expect(page.getByTestId("connection-status")).toHaveText("Olet offline-tilassa. Pöytä päivittyy, kun yhteys palautuu.");
  await page.context().setOffline(false);
  await expect(page.getByTestId("connection-status")).toHaveText("");
});
