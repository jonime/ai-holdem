import { extendResultsHistory } from "./personal-results-fixtures";
import { completed } from "./replay-fixtures";
import { scanAccessibility } from "./accessibility";
import { expect, test, type Page } from "./fixtures";
import { resultsResponseSchema } from "../../lib/http/results-contracts";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Stats", exact: true });
async function refreshTable(page: Page) {
  const read = page.waitForResponse(r => /\/api\/games\/[^/]+$/.test(new URL(r.url()).pathname));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await read;
}

test("personal results use real ownership, retain snapshot/replay focus, and fit mobile", { tag: "@ui-regression" }, async ({ page, browser }) => {
  const f = await completed(browser, page);
  try {
    await extendResultsHistory(f.id, 121);
    const response = await page.request.get(`/api/games/${f.id}/results`);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const { results } = resultsResponseSchema.parse(await response.json());
    expect(results.handsPlayed).toBe(121);
    expect(results.netChips).not.toBe(0);
    expect(JSON.stringify(results)).not.toMatch(/playerToken|engineState|initialState|finalState|cards/);
    const { feed } = await (await page.request.get(`/api/games/${f.id}/feed`)).json();
    expect(feed.events.length).toBeGreaterThan(0);
    expect(feed.events.every((event: { handNumber: number }) => event.handNumber >= 72)).toBe(true);
    await page.reload();
    await page.setViewportSize({ width: 375, height: 812 });
    const opener = page.getByRole("button", { name: "Stats", exact: true });
    await opener.click();
    await expect(dialog(page).locator("dd").first()).toHaveText("121");
    await expect(dialog(page).getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await expect(dialog(page)).not.toContainText("Completed hands through");
    const refresh = dialog(page).getByRole("button", { name: "Refresh results", exact: true });
    await expect(refresh).toHaveText("");
    const refreshBox = await refresh.boundingBox();
    const closeBox = await dialog(page).getByRole("button", { name: "Close", exact: true }).boundingBox();
    expect(Math.abs(refreshBox!.y - closeBox!.y)).toBeLessThan(3);
    await scanAccessibility(page, "personal-results-mobile");
    expect(await dialog(page).evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("personal-results-mobile.png") });
    const review = dialog(page).getByRole("button", { name: "Review", exact: true }).last();
    const amountBox = await dialog(page).locator('[data-result-highlight="biggestLoss"] p').last().boundingBox();
    const reviewBox = await review.boundingBox();
    expect(reviewBox!.y - amountBox!.y - amountBox!.height).toBeGreaterThanOrEqual(12);
    await review.click();
    const replay = page.getByRole("dialog", { name: "Review hand", exact: true });
    await expect(replay).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await expect(replay.getByRole("button", { name: /^Back to/ })).toHaveCount(0);
    await replay.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog(page).locator("dd").first()).toHaveText("121");
    await expect(review).toBeFocused();
    await page.route(`**/api/games/${f.id}/hands/1/replay`, route => route.fulfill({ status: 422, json: { code: "REPLAY_UNAVAILABLE", error: "Unavailable" } }));
    await review.click();
    await expect(replay).toContainText("This hand cannot be reviewed.");
    await page.keyboard.press("Escape");
    await expect(review).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    // Watchers never inherit host/seat results.
    const watcherContext = await browser.newContext();
    try {
      const watcher = await watcherContext.newPage();
      await watcher.goto(`/game/${f.id}`);
      await watcher.getByRole("button", { name: "Stats", exact: true }).click();
      await expect(dialog(watcher)).toContainText("No completed hands played by this browser player.");
    } finally { await watcherContext.close(); }
  } finally { await f.guestContext.close(); }
});

test("personal results loading, diagnostics/retry, incomplete coverage and explicit refresh", { tag: "@ui-regression" }, async ({ page, browser }) => {
  const f = await completed(browser, page);
  try {
    const { results } = resultsResponseSchema.parse(await (await page.request.get(`/api/games/${f.id}/results`)).json());
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    let reads = 0;
    let fail = true;
    let throughHand = 3;
    await page.route(`**/api/games/${f.id}/results`, async route => {
      reads++;
      await waiting;
      await route.fulfill(fail ? { status: 500, json: { error: "Unavailable", requestReference: "11111111-1111-4111-8111-111111111111" } } :
        { json: { results: { ...results, throughHand, handsPlayed: throughHand - 2, availableHands: throughHand - 2, incomplete: true, excludedHands: 2, ownershipIncomplete: true } } });
    });
    await page.getByRole("button", { name: "Stats", exact: true }).click();
    await expect(dialog(page)).toContainText("Loading your results");
    release();
    await expect(dialog(page)).toContainText("Unable to load your results");
    await expect(dialog(page).getByRole("button", { name: /Copy error details/ })).toBeVisible();
    fail = false;
    await dialog(page).getByRole("button", { name: "Retry", exact: true }).click();
    await expect(dialog(page)).toContainText("Excluded hands: 2.");
    await expect(dialog(page)).toContainText("ownership could not be established");
    const current = await f.read();
    await page.route(`**/api/games/${f.id}`, route => route.fulfill({ json: { game: { ...current, version: current.version + 1, poker: { ...current.poker, handNumber: 4 } } } }));
    await refreshTable(page);
    await expect(dialog(page)).toContainText("Another hand has completed.");
    await expect(dialog(page).locator("dd").first()).toHaveText("1");
    expect(reads).toBe(2);
    throughHand = 4;
    await dialog(page).getByRole("button", { name: "Refresh results", exact: true }).click();
    await expect(dialog(page).locator("dd").first()).toHaveText("2");
    expect(reads).toBe(3);
    await expect(dialog(page).getByRole("button", { name: "Close", exact: true })).toBeFocused();
  } finally { await f.guestContext.close(); }
});

test("personal results keep human turn warnings and timers live while suppressing gameplay keys", { tag: "@ui-regression" }, async ({ page, browser }) => {
  const f = await completed(browser, page);
  try {
    const current = await f.read();
    expect((await page.request.post(`/api/games/${f.id}/next-hand`, { data: { expectedVersion: current.version } })).ok()).toBe(true);
    let live = await f.read();
    if (live.poker.currentActorId !== f.ownerId) {
      expect((await f.guest.request.post(`/api/games/${f.id}/action`, { data: { expectedVersion: live.version, action: { type: "call" } } })).ok()).toBe(true);
      live = await f.read();
    }
    expect(live.poker.currentActorId).toBe(f.ownerId);
    await refreshTable(page);
    await page.getByRole("button", { name: "Stats", exact: true }).click();
    await expect(dialog(page).locator("[data-results-turn-warning]")).toContainText("Your turn");
    await expect(dialog(page).locator("[data-turn-countdown]")).toBeVisible();
    const version = live.version;
    await dialog(page).getByRole("heading", { name: "Stats" }).click();
    await page.keyboard.press("a"); await page.keyboard.press("s"); await page.keyboard.press("d"); await page.keyboard.press("Enter");
    expect((await f.read()).version).toBe(version);
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stats", exact: true })).toBeFocused();
  } finally { await f.guestContext.close(); }
});
