import { expect, test } from "@playwright/test";

test("@smoke Play navigation, empty state, custom creation, return and identity isolation", async ({ page, browser }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Quick Play vs AI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create custom table" })).toHaveCount(0);
  await page.getByRole("link", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("heading", { name: "Open public tables" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your tables" })).toHaveCount(0);
  const empty = await page.request.get("/api/games/mine?playerToken=other");
  expect(await empty.json()).toEqual({ games: [] }); expect(empty.headers()["cache-control"]).toContain("private, no-store");
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await expect(page).toHaveURL(/\/game\/[0-9a-f-]+$/);
  const gameUrl = page.url(); const gameId = new URL(gameUrl).pathname.split("/").at(-1);
  await page.goto("/play");
  const mine = page.getByRole("region", { name: "Your tables" });
  await expect(mine).not.toContainText("Recently active"); await expect(mine).toContainText("Waiting");
  const visitor = await browser.newContext();
  try {
    const visitorPage = await visitor.newPage(); await visitorPage.goto(gameUrl);
    expect(await (await visitor.request.get("/api/games/mine")).json()).toEqual({ games: [] });
    await visitorPage.goto("/play"); await expect(visitorPage.getByRole("heading", { name: "Your tables" })).toHaveCount(0);
    await visitorPage.getByRole("button", { name: "Create table", exact: true }).click();
    await expect(visitorPage).toHaveURL(/\/game\/[0-9a-f-]+$/);
    const visitorId = new URL(visitorPage.url()).pathname.split("/").at(-1);
    const first = await (await page.request.get("/api/games/mine")).json();
    const second = await (await visitor.request.get("/api/games/mine")).json();
    expect(first.games.map((game: { gameId: string }) => game.gameId)).toEqual([gameId]);
    expect(second.games.map((game: { gameId: string }) => game.gameId)).toEqual([visitorId]);
  } finally { await visitor.close(); }
  await mine.getByRole("link", { name: /^Return to table:/ }).press("Enter"); await expect(page).toHaveURL(gameUrl);
});

test("@smoke Play public refresh failures recover without refreshing personal tables", async ({ page }) => {
  await page.goto("/play");
  let personalRequests = 0;
  page.on("request", request => { if (request.url().endsWith("/api/games/mine")) personalRequests++; });
  await expect(page.getByRole("button", { name: "Refresh all tables" })).toHaveCount(0);
  // Local runs preserve tables, so establish the empty-directory branch explicitly.
  await page.route("**/api/games/public*", route => route.fulfill({ json: { games: [], nextCursor: null } }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("No public tables are available right now.")).toBeVisible();
  await page.route("**/api/games/public*", route => route.fulfill({ status: 500, json: { error: "Failed" } }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Public tables could not be loaded.")).toBeVisible();
  await expect(page.getByText("No public tables are available right now.")).toHaveCount(0);
  await page.route("**/api/games/public*", route => route.fulfill({ json: { games: [], nextCursor: null } }));
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("No public tables are available right now.")).toBeVisible();
  expect(personalRequests).toBe(0);
});

test("@smoke Play directory pagination, join conflict, redirects, mobile and keyboard", async ({ page }, testInfo) => {
  await page.goto("/fi-FI/join-game"); await expect(page).toHaveURL(/\/fi-FI\/play$/);
  const old = await page.request.get("/join-game", { maxRedirects: 0 }); expect(old.status()).toBe(308); expect(old.headers().location).toBe("/play");
  const language = await page.request.get("/play", { maxRedirects: 0, headers: { "Accept-Language": "fi" } }); expect(language.status()).toBe(200); expect(language.headers().location).toBeUndefined();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/play");
  const entry = { gameId: "11111111-1111-4111-8111-111111111111", title: "Pagination table", version: 1, occupiedSeats: 1, totalSeats: 6, humanCount: 1, botCount: 0, smallBlind: 10, bigBlind: 20, startingStack: 1000, publishedAt: "2026-10-06T12:00:00Z" };
  let calls = 0;
  await page.route("**/api/games/public*", route => route.fulfill({ json: ++calls === 1 ? { games: [], nextCursor: "next" } : { games: [entry], nextCursor: null } }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.getByRole("button", { name: "Join: Pagination table" })).toBeVisible();
  await page.route("**/api/games/*/join", route => route.fulfill({ status: 409, json: { error: "Conflict", code: "GAME_CONFLICT" } }));
  await page.getByRole("button", { name: "Join: Pagination table", exact: true }).press("Enter");
  await expect(page.getByText("That table changed. Review the refreshed list and try again.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const create = page.getByRole("button", { name: "Create table", exact: true });
  await page.getByLabel("Your name (optional)").focus(); await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Quick Play vs AI", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(create).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeFocused();
  await expect(page.locator("h1")).toHaveText("Play");
  await expect(page.getByText("Choose a public table with an active host.")).toHaveCount(0);
  const refresh = page.getByRole("button", { name: "Refresh", exact: true });
  const centered = await refresh.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const icon = button.querySelector("svg")!.getBoundingClientRect();
    return Math.abs(rect.x + rect.width / 2 - icon.x - icon.width / 2) < 1 &&
      Math.abs(rect.y + rect.height / 2 - icon.y - icon.height / 2) < 1;
  });
  expect(centered).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("play-mobile.png"), fullPage: true });
});
