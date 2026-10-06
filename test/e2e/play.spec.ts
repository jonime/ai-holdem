import { expect, test } from "@playwright/test";

test("@smoke Play navigation, empty state, custom creation, return and identity isolation", async ({ page, browser }) => {
  await page.goto("/en-US");
  await expect(page.getByRole("button", { name: "Quick Play vs AI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create custom table" })).toHaveCount(0);
  await page.getByRole("link", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/\/en-US\/play$/);
  await expect(page.getByRole("heading", { name: "Open public tables" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your tables" })).toHaveCount(0);
  const empty = await page.request.get("/api/games/mine?playerToken=other");
  expect(await empty.json()).toEqual({ games: [] }); expect(empty.headers()["cache-control"]).toContain("private, no-store");
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await expect(page).toHaveURL(/\/en-US\/game\/[0-9a-f-]+$/);
  const gameUrl = page.url(); const gameId = new URL(gameUrl).pathname.split("/").at(-1);
  await page.goto("/en-US/play");
  const mine = page.getByRole("region", { name: "Your tables" });
  await expect(mine).toContainText("Recently active"); await expect(mine).toContainText("Waiting");
  const visitor = await browser.newContext();
  try {
    const visitorPage = await visitor.newPage(); await visitorPage.goto(gameUrl);
    expect(await (await visitor.request.get("/api/games/mine")).json()).toEqual({ games: [] });
    await visitorPage.goto("/en-US/play"); await expect(visitorPage.getByRole("heading", { name: "Your tables" })).toHaveCount(0);
    await visitorPage.getByRole("button", { name: "Create table", exact: true }).click();
    await expect(visitorPage).toHaveURL(/\/en-US\/game\/[0-9a-f-]+$/);
    const visitorId = new URL(visitorPage.url()).pathname.split("/").at(-1);
    const first = await (await page.request.get("/api/games/mine")).json();
    const second = await (await visitor.request.get("/api/games/mine")).json();
    expect(first.games.map((game: { gameId: string }) => game.gameId)).toEqual([gameId]);
    expect(second.games.map((game: { gameId: string }) => game.gameId)).toEqual([visitorId]);
  } finally { await visitor.close(); }
  await mine.getByRole("link", { name: "Return to table" }).click(); await expect(page).toHaveURL(gameUrl);
});

test("@smoke Play refresh failures remain independent and recover with Retry", async ({ page }) => {
  await page.goto("/en-US/play");
  await page.route("**/api/games/mine", route => route.fulfill({ status: 500, json: { error: "Failed" } }));
  await page.route("**/api/games/public*", route => route.fulfill({ json: { games: [], nextCursor: null } }));
  await page.getByRole("button", { name: "Refresh all tables" }).click();
  await expect(page.getByRole("region", { name: "Your tables" }).getByRole("alert")).toHaveText("Your tables could not be loaded.");
  await expect(page.getByText("No public tables are available right now.")).toBeVisible();
  await page.unroute("**/api/games/mine");
  await page.getByRole("region", { name: "Your tables" }).getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your tables" })).toHaveCount(0);
  await page.route("**/api/games/public*", route => route.fulfill({ status: 500, json: { error: "Failed" } }));
  await page.getByRole("button", { name: "Refresh all tables" }).click();
  await expect(page.getByText("Public tables could not be loaded.").first()).toBeVisible();
  await expect(page.getByText("No public tables are available right now.")).toHaveCount(0);
});

test("@smoke Play directory pagination, join conflict, redirects, mobile and keyboard", async ({ page }, testInfo) => {
  await page.goto("/fi-FI/join-game"); await expect(page).toHaveURL(/\/fi-FI\/play$/);
  const old = await page.request.get("/en-US/join-game", { maxRedirects: 0 }); expect(old.status()).toBe(308); expect(old.headers().location).toBe("/en-US/play");
  const language = await page.request.get("/play", { maxRedirects: 0, headers: { "Accept-Language": "fi" } }); expect(language.status()).toBe(307); expect(language.headers().location).toContain("/fi-FI/play");
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/en-US/play");
  const entry = { gameId: "11111111-1111-4111-8111-111111111111", title: "Pagination table", version: 1, occupiedSeats: 1, totalSeats: 6, humanCount: 1, botCount: 0, smallBlind: 10, bigBlind: 20, startingStack: 1000, publishedAt: "2026-10-06T12:00:00Z" };
  let calls = 0;
  await page.route("**/api/games/public*", route => route.fulfill({ json: ++calls === 1 ? { games: [], nextCursor: "next" } : { games: [entry], nextCursor: null } }));
  await page.getByRole("button", { name: "Refresh all tables" }).click();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pagination table" })).toBeVisible();
  await page.route("**/api/games/*/join", route => route.fulfill({ status: 409, json: { error: "Conflict", code: "GAME_CONFLICT" } }));
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("That table changed. Review the refreshed list and try again.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const create = page.getByRole("button", { name: "Create table", exact: true });
  await create.focus(); await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Refresh all tables" })).toBeFocused();
  await expect(page.locator("h1")).toHaveText("Play");
  await page.screenshot({ path: testInfo.outputPath("play-mobile.png"), fullPage: true });
});
