import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import type { Game } from "../../components/poker/types";

async function read(page: Page, gameId: string): Promise<Game> {
  const response = await page.request.get(`/api/games/${gameId}`);
  expect(response.ok()).toBe(true); return (await response.json()).game;
}
async function create(page: Page, locale = "") {
  const response = await page.request.post(`${locale}/new-game`, { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const destination = response.headers().location;
  const gameId = new URL(destination).pathname.split("/").at(-1)!;
  await page.goto(destination); return gameId;
}
async function join(context: BrowserContext, gameId: string, seat: number) {
  const page = await context.newPage();
  // Establish identity before navigation starts browser reads, so concurrent
  // first-time responses cannot overwrite the cookie used to claim the seat.
  const game = await read(page, gameId);
  const response = await page.request.post(`/api/games/${gameId}/seats/${seat}/claim`, {
    data: { expectedVersion: game.version, name: `Guest ${seat}` },
  });
  expect(response.ok()).toBe(true); await page.goto(`/game/${gameId}`);
  return page;
}
async function start(page: Page, gameId: string) {
  const game = await read(page, gameId);
  expect((await page.request.post(`/api/games/${gameId}/start`, { data: { expectedVersion: game.version } })).ok()).toBe(true);
  await page.reload();
}

test("@smoke Last-human Leave supports cancellation, the title links home, and Play starts Quick Play", async ({ page }) => {
  const gameId = await create(page);
  let mutations = 0; page.on("request", request => { if (request.url().endsWith("/release")) mutations++; });
  await expect(page.locator("header a")).toHaveAttribute("href", "/");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Leave table", exact: true }).click();
  expect(mutations).toBe(0);
  await page.goto("/play");
  await expect(page).toHaveURL(/\/play$/);
  expect(mutations).toBe(0);
  expect((await read(page, gameId)).poker.players[0].status).toBe("claimed");
  await page.getByRole("button", { name: "Quick Play vs AI", exact: true }).click();
  await expect(page).toHaveURL(/\/game\/[0-9a-f-]+$/);
  expect(new URL(page.url()).pathname.split("/").at(-1)).not.toBe(gameId);
  await expect(page.getByRole("heading", { name: "Preflop", exact: true })).toBeVisible();
});

test("@smoke Leave table supports cancellation, stale retry and mobile navigation only after acknowledgement", async ({ page, browser }) => {
  const gameId = await create(page);
  const context = await browser.newContext();
  try {
    await join(context, gameId, 1);
    await expect(page.getByRole("button", { name: "Leave table", exact: true })).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    let releases = 0;
    page.on("request", request => { if (request.url().endsWith("/release")) releases++; });
    page.once("dialog", async dialog => { expect(dialog.message()).toBe("Leave this table? Your seat will be released now."); await dialog.dismiss(); });
    await page.getByRole("button", { name: "Leave table", exact: true }).click();
    expect(releases).toBe(0); await expect(page).toHaveURL(new RegExp(`/game/${gameId}$`));
    await page.route(`**/api/games/${gameId}/seats/0/release`, route => route.fulfill({ status: 409, json: { error: "Game changed", code: "GAME_CONFLICT" } }));
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Leave table", exact: true }).click();
    await expect(page.getByText("The table changed. Review it and try leaving again.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/game/${gameId}$`));
    await page.unroute(`**/api/games/${gameId}/seats/0/release`);
    let acknowledge!: () => void;
    const held = new Promise<void>(resolve => { acknowledge = resolve; });
    let intercepted!: () => void; const pending = new Promise<void>(resolve => { intercepted = resolve; });
    await page.route(`**/api/games/${gameId}/seats/0/release`, async route => {
      intercepted(); await held; await route.continue();
    });
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Leave table", exact: true }).click();
    await pending;
    await expect(page.getByRole("button", { name: "Leave table", exact: true })).toBeDisabled();
    await expect(page).toHaveURL(new RegExp(`/game/${gameId}$`));
    acknowledge();
    await expect(page).toHaveURL(/\/play$/);
    const released = await read(page, gameId);
    expect(released.poker.players[0].status).toBe("open");
    const mine = await (await page.request.get("/api/games/mine")).json();
    expect(mine.games.map((game: { gameId: string }) => game.gameId)).toContain(gameId);
  } finally { await context.close(); }
});

test("@smoke remaining browsers fold a departed human and finish after that browser closes", async ({ page, browser }) => {
  const gameId = await create(page);
  const guestContext = await browser.newContext(); const thirdContext = await browser.newContext();
  const replacementContext = await browser.newContext();
  try {
    const guest = await join(guestContext, gameId, 1); const third = await join(thirdContext, gameId, 2);
    await start(page, gameId);
    await expect(guest.getByRole("heading", { name: "Preflop", exact: true })).toBeVisible();
    expect((await read(page, gameId)).poker.currentActorId).toBe("human");
    guest.once("dialog", async dialog => {
      expect(dialog.message()).toBe("Leave this table? Your hand will fold when possible, and your seat will be released after this hand.");
      await dialog.accept();
    });
    await guest.getByRole("button", { name: "Leave table", exact: true }).click();
    await expect(guest).toHaveURL(/\/play$/); await guest.close();
    // Departure changes the version; settle the host's authoritative refresh before acting.
    const departureRefresh = page.waitForResponse(response => new URL(response.url()).pathname === `/api/games/${gameId}` && response.request().method() === "GET");
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await departureRefresh;
    await expect(page.getByText("Leaving after this hand", { exact: true }).filter({ visible: true })).toBeVisible();
    const advance = page.waitForResponse(response => response.url().endsWith("/advance-departure") && response.status() === 200);
    await page.getByRole("button", { name: /^Call/ }).click();
    await advance;
    await expect(third.getByRole("button", { name: "Fold", exact: true })).toBeEnabled();
    await third.getByRole("button", { name: "Fold", exact: true }).click();
    await expect.poll(async () => (await read(page, gameId)).status).toBe("complete");
    const game = await read(page, gameId);
    const departed = game.poker.players.find(player => player.seat === 1)!;
    expect(departed.status).toBe("open"); expect(departed.name).toBe("Guest 1");
    expect(departed.folded).toBe(true); expect(departed.holeCards).toBeNull();
    const feed = await (await page.request.get(`/api/games/${gameId}/feed`)).json();
    expect(feed.feed.events.filter((event: { type: string; action?: string; playerId?: string }) => event.type === "action" && event.action === "fold" && event.playerId === departed.id)).toHaveLength(1);
    const mine = await (await guestContext.request.get("/api/games/mine")).json();
    expect(mine.games.map((game: { gameId: string }) => game.gameId)).not.toContain(gameId);
    const replacement = await join(replacementContext, gameId, 1);
    const joined = await read(replacement, gameId);
    expect(joined.poker.seats?.find(seat => seat.seat === 1)?.id).not.toBe(departed.id);
    expect(joined.poker.seats?.find(seat => seat.seat === 1)?.stack).toBe(10_000);
    expect(joined.poker.players.find(player => player.id === departed.id)?.holeCards).toBeNull();
    await expect(replacement.getByRole("button", { name: "Leave table", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Next Hand", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Next Hand", exact: true }).click();
    await expect.poll(async () => (await read(replacement, gameId)).poker.handNumber).toBe(2);
    const next = await read(replacement, gameId);
    expect(next.poker.players.find(player => player.seat === 1)?.playerToken).not.toBeNull();
    expect(next.poker.players.find(player => player.seat === 1)?.name).toBe("Guest 1");
  } finally { await guestContext.close(); await thirdContext.close(); await replacementContext.close(); }
});

test("@smoke Stand up registers departure and stays watching; Finnish Lobby preserves navigation", async ({ page, browser }) => {
  const gameId = await create(page);
  const context = await browser.newContext(); const thirdContext = await browser.newContext();
  try {
    await join(context, gameId, 1); await join(thirdContext, gameId, 2); await start(page, gameId);
    await page.getByRole("button", { name: "Stand up", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/game/${gameId}$`));
    await expect(page.getByRole("button", { name: "Lobby", exact: true })).toBeEnabled();
    const game = await read(page, gameId);
    expect(game.status).toBe("playing"); expect(game.poker.players[0].leaving).toBe(true);
    await expect(page.getByText("You’re watching", { exact: true })).toBeVisible();
    await page.goto(`/fi-FI/game/${gameId}`);
    await page.getByRole("button", { name: "Aula", exact: true }).click();
    await expect(page).toHaveURL(/\/fi-FI\/play$/);
    await expect(page.getByRole("button", { name: "Pikapeli tekoälyä vastaan", exact: true })).toBeVisible();
  } finally { await context.close(); await thirdContext.close(); }
});
