import { expect, test, type Browser, type Page, type Locator } from "@playwright/test";
import type { Game, GameFeedEvent } from "../../components/poker/types";

test.use({ screenshot: "only-on-failure" });

async function twoPlayers(browser: Browser, page: Page) {
  await page.goto("/");
  await page.goto("/play");
  await page.getByRole("button", { name: "Create table" }).click();
  await page.getByRole("textbox", { name: "Your name" }).fill("Alex");
  const renamed = page.waitForResponse(r => r.url().endsWith("/name") && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Save name" }).click();
  expect((await renamed).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Save name" })).toBeDisabled();
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(page.url());
  await guest.getByRole("textbox", { name: "Your name" }).fill("Alex");
  await guest.getByRole("button", { name: "Sit here" }).first().click();
  await expect(guest.getByText("You’re seated. Waiting for the host to start.")).toBeVisible();
  await refresh(page);
  await expect(page.locator("article").getByText("Alex", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Start hand" })).toBeEnabled();
  await page.getByRole("combobox", { name: "Seats" }).selectOption("2");
  await page.getByRole("button", { name: "Start hand" }).click();
  await expect(page.getByRole("button", { name: "Fold", exact: true })).toBeEnabled();
  const id = page.url().split("/").at(-1)!;
  const getGame = async (): Promise<Game> => (await (await page.request.get(`/api/games/${id}`)).json()).game;
  const game = await getGame();
  const hostId = game.poker.players.find(p => p.playerToken !== null)!.id;
  return { guestContext, guest, id, hostId, getGame };
}

async function refresh(page: Page) {
  const response = page.waitForResponse(r => /\/api\/games\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method() === "GET", { timeout: 10_000 });
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await response;
}

function scroller(panel: Locator) { return panel.locator('[class*="scroll"]').first(); }
async function bottomDistance(panel: Locator) {
  return scroller(panel).evaluate(n => n.scrollHeight - n.clientHeight - n.scrollTop);
}

async function trayGeometry(page: Page) {
  return page.locator('[class*="actionTray"]').evaluate(tray => {
    const rect = tray.getBoundingClientRect();
    const controls = tray.querySelector('[class*="actionControls"]')!.getBoundingClientRect();
    const sizing = tray.querySelector('[class*="sizingArea"]')!.getBoundingClientRect();
    return { height: rect.height, controlsTop: controls.top - rect.top, controlsHeight: controls.height,
      sizingTop: sizing.top - rect.top, sizingHeight: sizing.height };
  });
}

test("persists public hand results through feed failure and refresh, preserves controls, and renders showdown boards", async ({ browser, page }) => {
  test.setTimeout(45_000);
  const { guestContext, guest, id, hostId, getGame } = await twoPlayers(browser, page);
  const panel = page.getByRole("complementary", { name: "Actions", exact: true });
  await expect(panel.locator('[class*="viewerEvent"]')).toHaveCount(1);
  const feedResponse = await page.request.get(`/api/games/${id}/feed`);
  const feed = (await feedResponse.json()).feed;
  const blinds = feed.events.filter((e: GameFeedEvent) => e.type === "blind");
  expect(blinds.map((e: { player: string }) => e.player)).toEqual(["Alex", "Alex"]);
  expect(new Set(blinds.map((e: { playerId: string }) => e.playerId)).size).toBe(2);
  expect(JSON.stringify(feed)).not.toMatch(/playerToken|engineState|initialState|latestState|holeCards/);

  const playingDesktopTray = await trayGeometry(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const playingMobileTray = await trayGeometry(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route(`**/api/games/${id}/feed*`, route => route.fulfill({ status: 500, json: { error: "Feed unavailable" } }));
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  const result = page.locator("[data-hand-result]");
  await expect(result).toContainText("Opponents folded.");
  const completed = await getGame();
  const winnerId = completed.poker.winnerIds[0];
  await expect(result).toContainText(`Alex wins ${completed.poker.winnerAmounts[winnerId]}`);
  await expect(result).toContainText("Opponents folded.");
  await expect(page.getByRole("spinbutton", { name: "Bet amount", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next Hand", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Show", exact: true })).toBeEnabled();
  expect(await trayGeometry(page)).toEqual(playingDesktopTray);
  await expect(page.locator('[class*="amountControl"]')).toBeHidden();
  expect(await page.locator('[class*="amountControl"]').evaluate(node => node.hasAttribute("inert"))).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await trayGeometry(page)).toEqual(playingMobileTray);
  await expect(result).toBeVisible();
  await page.screenshot({ path: "test-results/completed-hand-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    const region = document.querySelector('[data-hand-result]')!.parentElement!;
    const mutations: number[] = [];
    new MutationObserver(records => mutations.push(records.length)).observe(region, { subtree: true, childList: true, characterData: true });
    Object.assign(window, { resultMutations: mutations });
  });
  await refresh(page);
  await expect(result).toContainText("Opponents folded.");
  expect(await page.evaluate(() => (window as typeof window & { resultMutations: number[] }).resultMutations)).toEqual([]);
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show", exact: true })).toBeDisabled();
  await page.reload();
  await expect(result).toContainText("Opponents folded.");

  const spectatorContext = await browser.newContext();
  const spectator = await spectatorContext.newPage();
  await spectator.goto(page.url());
  await expect(spectator.locator("[data-hand-result]")).toContainText("Opponents folded.");
  await expect(spectator.getByRole("button", { name: "Next Hand", exact: true })).toHaveCount(0);
  await expect(spectator.getByRole("button", { name: "Show", exact: true })).toHaveCount(0);
  await expect(spectator.getByRole("complementary", { name: "Actions" }).locator('[class*="viewerEvent"]')).toHaveCount(0);

  await page.unroute(`**/api/games/${id}/feed*`);
  await page.getByRole("button", { name: "Next Hand", exact: true }).click();
  await expect(result).toHaveCount(0);
  expect(await trayGeometry(page)).toEqual(playingDesktopTray);
  await expect(page.getByRole("spinbutton", { name: "Bet amount", exact: true })).toBeVisible();
  let game = await getGame();
  for (let count = 0; game.poker.street !== "complete" && count < 12; count++) {
    const actor = game.poker.currentActorId === hostId ? page : guest;
    game = (await (await actor.request.get(`/api/games/${id}`)).json()).game;
    const action = game.poker.legalActions.find(a => a.type === "check") ?? game.poker.legalActions.find(a => a.type === "call");
    expect(action).toBeTruthy();
    const response = await actor.request.post(`/api/games/${id}/action`, { data: { expectedVersion: game.version, action } });
    expect(response.ok()).toBe(true);
    game = (await response.json()).game;
  }
  expect(game.poker.completionReason).toBe("showdown");
  await refresh(page);
  await expect(result).toBeVisible();
  for (const winner of game.poker.winnerIds) {
    await expect(result).toContainText(`Alex wins ${game.poker.winnerAmounts[winner]}`);
  }
  await expect(result).toContainText(/High card|Pair|Two pair|Three of a kind|Straight|Flush|Full house|Four of a kind/i);
  await expect(result).not.toContainText("Opponents folded.");
  await expect(panel.getByRole("heading", { name: "Flop", exact: true }).last().locator("..").locator("[data-playing-card]")).toHaveCount(3);
  await expect(panel.getByRole("heading", { name: "Turn", exact: true }).last().locator("..").locator("[data-playing-card]")).toHaveCount(4);
  await expect(panel.getByRole("heading", { name: "River", exact: true }).last().locator("..").locator("[data-playing-card]")).toHaveCount(5);
  await page.screenshot({ path: "test-results/completed-hand-desktop.png", fullPage: true });
  await spectatorContext.close();
  await guestContext.close();
});

test("follows within 24px, pauses older reading, handles legacy identity, and reopens desktop and mobile at latest", async ({ browser, page }) => {
  test.setTimeout(45_000);
  const { guestContext, guest, id, hostId, getGame } = await twoPlayers(browser, page);
  const guestId = (await getGame()).poker.players.find(p => p.id !== hostId)!.id;
  let events: GameFeedEvent[] = [
    { type: "handStarted", handNumber: 1 },
    ...Array.from({ length: 80 }, (_, index): GameFeedEvent => ({ type: "action", handNumber: 1, player: "Alex", playerId: index % 3 === 0 ? hostId : index % 3 === 1 ? guestId : null, controller: "human", action: "check", amount: null, street: "preflop" })),
    { type: "street", handNumber: 1, street: "flop", cards: ["Ac", "Kd", "Qh"] },
  ];
  await page.route(`**/api/games/${id}/feed*`, route => route.fulfill({ json: { feed: { events } } }));
  await page.reload();
  const panel = page.getByRole("complementary", { name: "Actions", exact: true });
  await expect(panel.getByRole("heading", { name: "Flop", exact: true })).toBeVisible();
  await expect(panel.getByText("You", { exact: true })).toHaveCount(0);
  await expect(panel.locator('[class*="viewerEvent"]')).toHaveCount(27);
  await expect(panel.locator('[class*="viewerEvent"]').first()).toHaveCSS("font-weight", "700");
  await expect(panel.locator('[class*="viewerEvent"]').first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(panel.locator("[data-playing-card]")).toHaveCount(3);
  await expect.poll(() => bottomDistance(panel)).toBeLessThanOrEqual(1);

  // The threshold includes 24px but pauses at 25px.
  await scroller(panel).evaluate(n => { n.scrollTop = n.scrollHeight - n.clientHeight - 25; });
  await expect(panel.getByRole("button", { name: "Latest action", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Latest action", exact: true }).click();
  // A real version change triggers the next feed fetch.
  await scroller(panel).evaluate(n => { n.scrollTop = n.scrollHeight - n.clientHeight - 24; });
  events = [...events, { type: "action", handNumber: 1, player: "Alex", playerId: hostId, controller: "human", action: "fold", amount: null, street: "flop" }];
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(panel.locator('[class*="viewerEvent"]')).toHaveCount(28);
  await expect.poll(() => bottomDistance(panel)).toBeLessThanOrEqual(1);

  await scroller(panel).evaluate(n => { n.scrollTop = 120; });
  await expect(panel.getByRole("button", { name: "Latest action", exact: true })).toBeVisible();
  const readingPosition = await scroller(panel).evaluate(n => n.scrollTop);
  events = [...events, { type: "handStarted", handNumber: 2 }, { type: "street", handNumber: 2, street: "preflop", cards: [] }];
  await page.getByRole("button", { name: "Next Hand", exact: true }).click();
  await expect(panel.getByText("Hand #2", { exact: true })).toHaveCount(1);
  expect(await scroller(panel).evaluate(n => n.scrollTop)).toBe(readingPosition);
  await panel.getByRole("button", { name: "Latest action", exact: true }).click();
  await expect.poll(() => bottomDistance(panel)).toBeLessThanOrEqual(1);
  await expect(panel.getByRole("button", { name: "Latest action", exact: true })).toHaveCount(0);
  await scroller(panel).evaluate(n => { n.scrollTop = 0; });
  await expect(panel.getByRole("button", { name: "Latest action", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Collapse actions panel" }).click();
  await page.getByRole("button", { name: "Expand actions panel" }).click();
  await expect.poll(() => bottomDistance(panel)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Collapse actions panel" }).click();
  const sheet = page.getByRole("dialog", { name: "Actions", exact: true });
  await expect(sheet).toBeVisible();
  await expect.poll(() => bottomDistance(sheet)).toBeLessThanOrEqual(1);
  await scroller(sheet).evaluate(n => { n.scrollTop = 120; });
  await expect(sheet.getByRole("button", { name: "Latest action", exact: true })).toBeVisible();
  const mobilePosition = await scroller(sheet).evaluate(n => n.scrollTop);
  events = [...events, { type: "action", handNumber: 2, player: "Alex", playerId: guestId, controller: "human", action: "fold", amount: null, street: "preflop" }];
  await guest.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(sheet.getByText("Alex folds", { exact: true })).toHaveCount(1);
  expect(await scroller(sheet).evaluate(n => n.scrollTop)).toBe(mobilePosition);
  // Next development cache badge overlaps the sheet footer on narrow screens.
  const cacheBadge = page.getByRole("button", { name: "Collapse Cache disabled badge" });
  if (await cacheBadge.isVisible()) await cacheBadge.click();
  await sheet.getByRole("button", { name: "Latest action", exact: true }).click();
  await expect.poll(() => bottomDistance(sheet)).toBeLessThanOrEqual(1);
  events = [...events, { type: "win", handNumber: 2, player: "Alex", playerId: hostId, amount: 100, uncontested: true }];
  const completed = await getGame();
  const reveal = await page.request.post(`/api/games/${id}/reveal`, {
    data: { expectedVersion: completed.version, handNumber: completed.poker.handNumber },
  });
  expect(reveal.ok()).toBe(true);
  await refresh(page);
  await expect(sheet.getByText("Alex wins 100 (opponents folded)", { exact: true })).toHaveCount(1);
  await expect.poll(() => bottomDistance(sheet)).toBeLessThanOrEqual(1);
  await scroller(sheet).evaluate(n => { n.scrollTop = 0; });
  await sheet.getByRole("button", { name: "Close actions panel" }).click();
  await page.getByRole("button", { name: "Expand actions panel" }).click();
  await expect.poll(() => bottomDistance(sheet)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/actions-mobile.png", fullPage: true });
  await guestContext.close();
});


test("refreshes only the changing hand range and retains earlier results", async ({ browser, page }) => {
  test.setTimeout(45_000);
  const feeds: { query: string | null; events: GameFeedEvent[] }[] = [];
  page.on("response", async response => {
    const url = new URL(response.url());
    if (!url.pathname.endsWith("/feed") || !response.ok()) return;
    const body = await response.json();
    feeds.push({ query: url.searchParams.get("sinceHand"), events: body.feed.events });
  });
  const { guestContext, id } = await twoPlayers(browser, page);
  try {
    await expect.poll(() => feeds.some(f => f.query === null && f.events.some(e => e.handNumber === 1))).toBe(true);
    await page.getByRole("button", { name: "Fold", exact: true }).click();
    await expect.poll(() => feeds.some(f => f.query === "1" && f.events.some(e => e.type === "win"))).toBe(true);
    await page.getByRole("button", { name: "Next Hand", exact: true }).click();
    await expect.poll(() => feeds.some(f => f.query === "1" && f.events.some(e => e.handNumber === 2))).toBe(true);
    const panel = page.getByRole("complementary", { name: "Actions", exact: true });
    await expect(panel.getByText("Hand #1", { exact: true })).toBeVisible();
    await expect(panel.getByText("Hand #2", { exact: true })).toBeVisible();
    const full = (await (await page.request.get(`/api/games/${id}/feed`)).json()).feed;
    const partial = (await (await page.request.get(`/api/games/${id}/feed?sinceHand=2`)).json()).feed;
    expect(partial.events.length).toBeLessThan(full.events.length);
    expect(partial.events.every((event: GameFeedEvent) => event.handNumber === 2)).toBe(true);
    expect(JSON.stringify(partial)).not.toMatch(/playerToken|engineState|initialState|latestState|holeCards/);
  } finally { await guestContext.close(); }
});
