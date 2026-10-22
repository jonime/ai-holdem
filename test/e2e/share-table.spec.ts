import { createUITable } from "./ui-fixtures";
import { expect, test, type Page } from "./fixtures";
import type { Game } from "../../components/poker/types";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Share table", exact: true });
const headerShare = (page: Page) => page.locator("header").first().getByRole("button", { name: "Share", exact: true });
async function setup(page: Page, playing = false) {
  const id = await createUITable(page, playing);
  const original: Game = (await (await page.request.get(`/api/games/${id}`)).json()).game;
  const human = original.poker.players.find(p => p.controller === "human")!;
  let game: Game = { ...original, poker: { ...original.poker, currentActorId: playing ? human.id : original.poker.currentActorId } };
  await page.route(`**/api/games/${id}`, route => route.fulfill({ json: { game } }));
  await page.goto(`/game/${id}?playerToken=secret#private`);
  await expect(headerShare(page)).toBeVisible();
  return { id, current: () => game, set: async (next: Game) => {
    game = next;
    const read = page.waitForResponse(r => new URL(r.url()).pathname === `/api/games/${id}`);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await read;
  } };
}

test("table sharing has two entry points, clean links, clipboard feedback and focus restoration", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await setup(page);
  const mutations: string[] = [];
  page.on("request", request => { if (request.method() !== "GET") mutations.push(request.url()); });
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    writeText: async (value: string) => { Object.assign(window, { copiedTableUrl: value }); },
  } }));
  const lobbyShare = page.locator("section").filter({ has: page.getByRole("heading", { name: "Choose your table" }) }).getByRole("button", { name: "Share", exact: true });
  for (const opener of [headerShare(page), lobbyShare]) {
    await opener.focus(); await page.keyboard.press("Enter");
    const copy = dialog(page).getByRole("button", { name: "Copy link", exact: true });
    await expect(copy).toBeFocused();
    await expect(dialog(page)).toContainText("Invite visitors to choose an available seat");
    await expect(dialog(page)).toContainText("Your private cards stay hidden.");
    const originalBox = await copy.boundingBox();
    await page.keyboard.press("Enter");
    const copied = dialog(page).getByRole("button", { name: "Copied", exact: true });
    await expect(copied).toBeVisible();
    const copiedBox = await copied.boundingBox();
    expect(copiedBox?.width).toBe(originalBox?.width);
    expect(copiedBox?.height).toBe(originalBox?.height);
    await expect(copy).toBeVisible({ timeout: 4000 });
    const restoredBox = await copy.boundingBox();
    expect(restoredBox?.width).toBe(originalBox?.width);
    expect(restoredBox?.height).toBe(originalBox?.height);
    expect(await page.evaluate(() => Reflect.get(window, "copiedTableUrl"))).toBe(`${new URL(page.url()).origin}/game/${f.id}`);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0); await expect(opener).toBeFocused();
  }
  await headerShare(page).click();
  await expect(dialog(page).getByRole("button", { name: "Copied", exact: true })).toHaveCount(0);
  for (const unavailable of [false, true]) {
    await page.evaluate(unavailable => Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: unavailable ? undefined : { writeText: () => Promise.reject(new Error("denied")) },
    }), unavailable);
    await dialog(page).getByRole("button", { name: "Copy link" }).click();
    await expect(dialog(page).getByRole("alert")).toContainText("copy the visible URL manually");
    const url = dialog(page).getByRole("textbox", { name: "Table link" });
    await expect(url).toHaveAttribute("readonly", "");
    await url.click();
    expect(await url.evaluate((input: HTMLInputElement) => input.value.slice(input.selectionStart!, input.selectionEnd!))).toBe(`${new URL(page.url()).origin}/game/${f.id}`);
  }
  for (const key of ["Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(await dialog(page).evaluate(d => d.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  }
  await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(headerShare(page)).toBeFocused();
  await headerShare(page).click(); await page.mouse.click(1, 1);
  await expect(dialog(page)).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test("sharing stays live, suppresses actions, handles late clipboard results and fits mobile", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await setup(page, true);
  const timed = f.current();
  const now = Date.now();
  await f.set({ ...timed, serverTime: new Date(now).toISOString(), turnTimer: {
    decisionId: "10000000-0000-4000-8000-000000000000", actorEngineId: timed.poker.currentActorId!,
    handNumber: timed.poker.handNumber, deadline: new Date(now + 60000).toISOString(),
  } });
  await page.setViewportSize({ width: 320, height: 740 });
  const mutations: string[] = [];
  page.on("request", r => { if (r.method() !== "GET") mutations.push(r.url()); });
  await headerShare(page).click();
  await expect(dialog(page)).toContainText("Your turn");
  const countdown = dialog(page).getByRole("timer");
  await expect(countdown).toBeVisible();
  const remaining = Number(await countdown.textContent());
  await expect.poll(async () => Number(await countdown.textContent())).toBeLessThan(remaining);
  await expect(dialog(page)).toContainText("Visitors can watch the table. A seat is not guaranteed.");
  await dialog(page).getByRole("heading").click();
  for (const key of ["a", "s", "d", "q", "e"]) await page.keyboard.press(key);
  expect(mutations).toEqual([]);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    writeText: () => new Promise<void>(resolve => Object.assign(window, { finishTableCopy: resolve })),
  } }));
  await dialog(page).getByRole("button", { name: "Copy link" }).click();
  await page.keyboard.press("Escape"); await headerShare(page).click();
  await page.evaluate(() => Reflect.get(window, "finishTableCopy")());
  await expect(dialog(page).getByRole("button", { name: "Copied", exact: true })).toHaveCount(0);
  await expect(dialog(page).getByRole("button", { name: "Copy link" })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath("share-table-mobile.png") });
  expect(await dialog(page).evaluate(d => d.scrollWidth <= d.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  const labels = await page.locator("header").first().getByRole("button").allTextContents();
  expect(labels.slice(0, 3)).toEqual(["Share", "Help", "Settings"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const game = f.current();
  await f.set({ ...game, status: "complete", turnTimer: null, version: game.version + 1, poker: { ...game.poker, street: "complete", currentActorId: null, legalActions: [] } });
  await headerShare(page).click();
  await expect(dialog(page)).toContainText("Visitors can watch the table.");
});

test("full waiting tables and spectators offer watching, with localized clean URLs", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await setup(page);
  const game = f.current();
  await f.set({ ...game, viewerIsHost: false, version: game.version + 1, poker: { ...game.poker,
    players: game.poker.players.map(p => ({ ...p, status: "claimed", playerToken: null })),
    seats: game.poker.seats?.map(p => ({ ...p, status: "claimed", playerToken: null })),
  } });
  await headerShare(page).click();
  await expect(dialog(page)).toContainText("Visitors can watch the table.");
  await expect(dialog(page)).not.toContainText("choose an available seat");
  await page.keyboard.press("Escape");
  await page.goto(`/fi-FI/game/${f.id}?token=secret#cards`);
  await page.getByRole("button", { name: "Jaa", exact: true }).first().click();
  const localized = page.getByRole("dialog", { name: "Jaa pöytä" });
  await expect(localized.getByRole("textbox", { name: "Pöydän linkki" })).toHaveValue(`${new URL(page.url()).origin}/fi-FI/game/${f.id}`);
});
