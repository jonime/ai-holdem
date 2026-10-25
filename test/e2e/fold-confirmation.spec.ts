import { createUITable } from "./ui-fixtures";
import { expect, test, type Page } from "./fixtures";
import type { Game } from "../../components/poker/types";

async function fixture(page: Page) {
  const id = await createUITable(page, true);
  const original: Game = (await (await page.request.get(`/api/games/${id}`)).json()).game;
  const human = original.poker.players.find(p => p.controller === "human")!;
  let game: Game = { ...original, version: original.version + 100, poker: { ...original.poker,
    currentActorId: human.id, legalActions: [{ type: "fold" }, { type: "check" }] } };
  const requests: unknown[] = [];
  await page.route(`**/api/games/${id}`, route => route.fulfill({ json: { game } }));
  await page.route(`**/api/games/${id}/action`, route => {
    requests.push(route.request().postDataJSON());
    game = { ...game, version: game.version + 1, poker: { ...game.poker, currentActorId: null, legalActions: [] } };
    return route.fulfill({ json: { game } });
  });
  await page.goto(`/game/${id}`);
  await expect(page.getByRole("button", { name: "Fold", exact: true })).toBeEnabled();
  return { id, requests, current: () => game, set: (value: Game) => { game = value; } };
}
const dialog = (page: Page) => page.getByRole("dialog", { name: "Check instead?", exact: true });
const fold = (page: Page) => page.getByRole("button", { name: "Fold", exact: true });
async function refresh(page: Page) {
  const response = page.waitForResponse(r => /\/api\/games\/[^/]+$/.test(new URL(r.url()).pathname));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await response;
}
async function open(page: Page, shortcut: boolean) {
  if (shortcut) {
    await fold(page).focus();
    await page.keyboard.press("a");
  } else await fold(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Check", exact: true })).toBeFocused();
}

for (const shortcut of [false, true]) {
  test(`free-check fold ${shortcut ? "shortcut" : "button"} cancels and restores focus`, { tag: "@ui-regression" }, async ({ page }) => {
    const f = await fixture(page);
    for (const dismiss of ["escape", "close", "backdrop"]) {
      await open(page, shortcut);
      await page.keyboard.down("a"); await page.keyboard.down("a"); await page.keyboard.up("a");
      await dialog(page).getByRole("heading").click();
      for (const key of ["s", "d", "q", "e"]) await page.keyboard.press(key);
      expect(f.requests).toEqual([]);
      if (dismiss === "escape") await page.keyboard.press("Escape");
      else if (dismiss === "close") await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
      else await page.mouse.click(2, 2);
      await expect(dialog(page)).toHaveCount(0);
      await expect(fold(page)).toBeFocused();
      expect(f.requests).toEqual([]);
    }
  });
  for (const choice of ["check", "fold"] as const) test(`${shortcut ? "shortcut" : "button"} confirmation submits ${choice} once`, { tag: "@ui-regression" }, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    const f = await fixture(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await open(page, shortcut);
    await page.screenshot({ path: test.info().outputPath("fold-confirmation-dark-mobile.png") });
    const button = dialog(page).getByRole("button", { name: choice === "check" ? "Check" : "Fold anyway", exact: true });
    // Same-event duplicate activation exercises the shared synchronous lock.
    await button.evaluate((node: HTMLButtonElement) => { node.click(); node.click(); });
    await expect(dialog(page)).toHaveCount(0);
    await expect.poll(() => f.requests.length).toBe(1);
    expect(f.requests[0]).toEqual({ expectedVersion: f.current().version - 1, action: { type: choice } });
    await expect(page.locator('[tabindex="-1"]').filter({ has: page.locator('section') }).first()).toBeFocused();
  });
  test(`fold ${shortcut ? "shortcut" : "button"} facing a bet stays immediate`, { tag: "@ui-regression" }, async ({ page }) => {
    const f = await fixture(page);
    f.set({ ...f.current(), poker: { ...f.current().poker, legalActions: [{ type: "fold" }, { type: "call", amount: 50 }] } });
    await refresh(page);
    await expect(page.getByRole("button", { name: "Call 50", exact: true })).toBeEnabled();
    if (shortcut) { await fold(page).focus(); await page.keyboard.press("a"); }
    else await fold(page).click();
    await expect.poll(() => f.requests.length).toBe(1);
    await expect(dialog(page)).toHaveCount(0);
  });
}

for (const change of ["version", "hand", "actor", "ownership", "seatOwnership", "legal", "deadline", "navigation", "offline"] as const) test(`confirmation closes on ${change}`, { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  if (change === "deadline") {
    f.set({ ...f.current(), serverTime: new Date().toISOString(), turnTimer: {
      decisionId: "00000000-0000-4000-8000-000000000001", actorEngineId: f.current().poker.currentActorId!, handNumber: f.current().poker.handNumber,
      deadline: new Date(Date.now() + 1500).toISOString(),
    } });
    await refresh(page);
  }
  await open(page, false);
  if (change === "deadline") await expect(dialog(page).getByRole("timer")).toBeVisible();
  else if (change === "navigation") await page.goto("/play");
  else if (change === "offline") await page.context().setOffline(true);
  else {
    const game = f.current();
    f.set(change === "version" ? { ...game, version: game.version + 1 } : { ...game, poker: { ...game.poker,
      ...(change === "hand" ? { handNumber: game.poker.handNumber + 1 } :
        change === "actor" ? { currentActorId: null } :
        change === "legal" ? { legalActions: [{ type: "fold" }] } :
        change === "seatOwnership" ? { seats: game.poker.players.map(p => ({ ...p, playerToken: null })) } : { players: game.poker.players.map(p => ({ ...p, playerToken: null })) }),
    } });
    await refresh(page);
  }
  await expect(dialog(page)).toHaveCount(0);
  expect(f.requests).toEqual([]);
});

test("same decision refresh stays valid and native keyboard activation submits Check", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  await open(page, true); await refresh(page);
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(() => f.requests.length).toBe(1);
  expect(f.requests[0]).toMatchObject({ action: { type: "check" } });
});

test("failed confirmation keeps unknown-outcome recovery and never replays", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  let calls = 0;
  await page.route(`**/api/games/${f.id}/action`, route => { calls++; return route.abort("failed"); });
  await open(page, true);
  await dialog(page).getByRole("button", { name: "Check", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).toContainText("Check the table before trying again");
  await refresh(page);
  expect(calls).toBe(1);
});

for (const theme of ["light", "dark"] as const) test(`compact confirmation fits ${theme} layouts`, { tag: "@ui-regression" }, async ({ page }) => {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await fixture(page);
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await open(page, false);
    const bounds = await dialog(page).locator("div").first().boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.width).toBeLessThanOrEqual(Math.min(420, width));
    expect(bounds!.height).toBeLessThanOrEqual(height);
    for (const button of await dialog(page).getByRole("button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: test.info().outputPath(`fold-${theme}-${width}x${height}.png`) });
    await page.keyboard.press("Escape");
  }
});

test("failed recovery blocks new confirmation requests", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  let calls = 0;
  await page.route(`**/api/games/${f.id}/action`, route => { calls++; return route.abort("failed"); });
  await open(page, false);
  await page.route(`**/api/games/${f.id}`, route => route.abort("failed"));
  await dialog(page).getByRole("button", { name: "Fold anyway", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh table", exact: true })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await expect(fold(page)).toBeDisabled();
  await page.locator("main").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("a");
  await expect(dialog(page)).toHaveCount(0);
  expect(calls).toBe(1);
});

test("keyboard button activation and shortcut fallback retain native focus behavior", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  const table = page.locator('[tabindex="-1"]').filter({ has: page.locator("section") }).first();
  await page.locator("main").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("a");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(table).toBeFocused();
  expect(f.requests).toEqual([]);
  await fold(page).press("Enter");
  await expect(dialog(page).getByRole("button", { name: "Check", exact: true })).toBeFocused();
  await dialog(page).getByRole("button", { name: "Fold anyway", exact: true }).press("Space");
  await expect.poll(() => f.requests.length).toBe(1);
  expect(f.requests[0]).toMatchObject({ action: { type: "fold" } });
});
