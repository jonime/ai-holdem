import { createUITable } from "./ui-fixtures";
import { expect, test, type Page, type Locator } from "@playwright/test";
import type { Game, GameFeedEvent } from "../../components/poker/types";

// Real persisted route, with controlled public responses for deterministic UI transitions.
async function fixture(page: Page, spectator = false) {
  const gameId = await createUITable(page, true);
  const original: Game = (await (await page.request.get(`/api/games/${gameId}`)).json()).game;
  const human = original.poker.players.find(p => p.controller === "human")!;
  let game: Game = { ...original, version: original.version + 100,
    viewerIsHost: !spectator,
    poker: { ...original.poker, currentActorId: human.id,
      players: original.poker.players.map(p => ({ ...p, playerToken: spectator ? null : p.playerToken })),
      seats: spectator ? [...original.poker.players.map(p => ({ ...p, playerToken: null })),
        { ...human, id: "open", seat: 6, status: "open", playerToken: null, holeCards: null }] : original.poker.seats,
      legalActions: [{ type: "fold" }, { type: "check" }, { type: "raise", minAmount: 200, maxAmount: 1000 }],
    } };
  await page.route(`**/api/games/${gameId}`, route => route.fulfill({ json: { game } }));
  const events: GameFeedEvent[] = Array.from({ length: 100 }, () => ({
    type: "action", handNumber: 1, player: "Reader", playerId: human.id, controller: "human",
    action: "check", amount: null, street: "preflop",
  }));
  await page.route(`**/api/games/${gameId}/feed*`, route => route.fulfill({ json: { feed: { events } } }));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/game/${gameId}`);
  return { gameId, human, current: () => game, set: (next: Game) => { game = next; } };
}
async function refresh(page: Page) {
  const response = page.waitForResponse(r => /\/api\/games\/[^/]+$/.test(new URL(r.url()).pathname));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await response;
}
async function contained(page: Page, dialog: Locator) {
  for (const key of ["Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    // Native Tab may visit browser chrome (activeElement becomes body), never background controls.
    expect(await dialog.evaluate(d => d.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  }
}
const actions = (page: Page) => page.getByRole("dialog", { name: "Actions", exact: true });
async function openActions(page: Page) {
  await page.getByRole("button", { name: "Expand actions panel" }).click();
  await expect(actions(page)).toBeVisible();
  await expect(actions(page).getByRole("button", { name: "Close actions panel" })).toBeFocused();
}

test("Actions contains focus, locks background scroll, preserves reading and ignores gameplay keys", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  const input = page.locator("#bet-target");
  await expect(input).toHaveValue("200");
  const requests: string[] = [];
  page.on("request", r => { if (/\/(action|reveal|next-hand)$/.test(r.url())) requests.push(r.url()); });
  await page.evaluate(() => { document.body.style.overflow = "auto"; document.documentElement.style.overflow = "scroll"; });
  await openActions(page);
  const dialog = actions(page);
  await contained(page, dialog);
  const scroll = dialog.locator('[class*="scroll"]').first();
  await scroll.evaluate(n => { n.scrollTop = 120; });
  await expect(dialog.getByRole("button", { name: "Latest action" })).toBeVisible();
  await dialog.getByRole("heading").click();
  for (const key of ["a", "s", "d", "q", "e", "ArrowLeft", "ArrowRight", "Shift+E", "Enter", "Space"]) await page.keyboard.press(key);
  await expect(input).toHaveValue("200");
  expect(requests).toEqual([]);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(10, 10);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  const reading = await scroll.evaluate(n => n.scrollTop);
  f.set({ ...f.current(), version: f.current().version + 1 });
  await refresh(page);
  await expect.poll(() => scroll.evaluate(n => n.scrollTop)).toBe(reading);
  // Native Tab may visit browser chrome (activeElement becomes body), never background controls.
    expect(await dialog.evaluate(d => d.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  // A pointer started inside must never turn into backdrop dismissal.
  const rect = await dialog.locator('[class*="modalDialog"]').boundingBox();
  await page.mouse.move(rect!.x + 30, rect!.y + 30);
  await page.mouse.down(); await page.mouse.move(10, 10); await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Expand actions panel" })).toBeFocused();
  await expect(page.locator("html")).toHaveCSS("overflow", "scroll");
  await expect(page.locator("body")).toHaveCSS("overflow", "auto");
  await page.keyboard.press("e");
  await expect(input).toHaveValue("300");
  await openActions(page);
  await actions(page).getByRole("button", { name: "Close actions panel" }).click();
  await expect(page.getByRole("button", { name: "Expand actions panel" })).toBeFocused();
  await openActions(page);
  await page.mouse.click(10, 10);
  await expect(dialog).toHaveCount(0);
  await openActions(page);
  await page.evaluate(() => {
    const table = document.querySelector('[class*="gameLayout"]')!;
    const restored: string[] = [];
    document.addEventListener("focusin", event => {
      if (event.target instanceof Node && table.contains(event.target)) restored.push("old table");
    });
    Object.assign(window, { restored });
    document.querySelector<HTMLAnchorElement>('header a[href="/"]')!.click();
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("html")).toHaveCSS("overflow", "scroll");
  expect(await page.evaluate(() => (window as typeof window & { restored: string[] }).restored)).toEqual([]);
});

test("Actions suppresses reveal and next-hand, then restores eligible shortcuts", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  const game = f.current();
  f.set({ ...game, status: "complete", poker: { ...game.poker, street: "complete", completionReason: "fold",
    currentActorId: null, legalActions: [], winnerIds: [game.poker.players[1].id], winnerAmounts: { [game.poker.players[1].id]: 150 } } });
  await refresh(page);
  await expect(page.getByRole("button", { name: "Show", exact: true })).toBeEnabled();
  let reveals = 0, next = 0;
  await page.route(`**/api/games/${f.gameId}/reveal`, route => { reveals++; return route.fulfill({ json: { game: f.current() } }); });
  await page.route(`**/api/games/${f.gameId}/next-hand`, route => { next++; return route.fulfill({ json: { game: f.current() } }); });
  await openActions(page);
  await actions(page).getByRole("heading").click();
  for (const key of ["d", "s", "Enter", "Space"]) await page.keyboard.press(key);
  expect(reveals).toBe(0); expect(next).toBe(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("d");
  await expect.poll(() => reveals).toBe(1);
  await expect(page.getByRole("button", { name: "Next Hand", exact: true })).toBeEnabled();
  await page.keyboard.press("s");
  await expect.poll(() => next).toBe(1);
});

test("Join form retains typing, containment and retry; dismissal keeps pending claim and restores fallback", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page, true);
  const spectatorGame = f.current();
  const opener = page.getByRole("button", { name: "Sit in an open seat" });
  await opener.click();
  const dialog = page.getByRole("dialog");
  const name = dialog.getByRole("textbox", { name: "Your name" });
  await expect(name).toBeFocused();
  await contained(page, dialog);
  await name.fill("Reader asdq e");
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(name).toHaveValue("Reader asdq e");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(opener).toBeFocused();
  await opener.click();
  await page.mouse.click(1, 1);
  await expect(opener).toBeFocused();
  await opener.click();
  let claims = 0;
  let release!: () => void;
  let held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/games/${f.gameId}/seats/*/claim`, async route => {
    claims++;
    if (claims === 1) { await route.fulfill({ status: 500, json: { error: "Try again" } }); return; }
    await held;
    const game = f.current();
    const token = (await page.context().cookies()).find(c => c.name === "ai-holdem-player-id")!.value;
    f.set({ ...game, version: game.version + 1, poker: { ...game.poker,
      players: game.poker.players.map(p => p.id === f.human.id ? { ...p, playerToken: token } : p),
      seats: game.poker.players.map(p => p.id === f.human.id ? { ...p, playerToken: token } : p) } });
    await route.fulfill({ json: { seat: { gameId: game.id, seat: 6, name: "Reader", status: "claimed", controller: "human", playerToken: token, isHost: false } } });
  });
  await name.press("Enter");
  await expect(page.locator("main").getByRole("alert")).toContainText("Try again");
  await expect(name).toBeEnabled();
  await name.press("Enter");
  await expect.poll(() => claims).toBe(2);
  await name.press("Enter");
  expect(claims).toBe(2);
  // Success while open removes the opener and restores focus to the table.
  release();
  await expect(opener).toHaveCount(0);
  await expect(page.locator('[class*="gameLayout"]')).toBeFocused();
  await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
  // A later submitted request continues after Escape, without reopening the dialog.
  f.set({ ...spectatorGame, version: f.current().version + 1 });
  await refresh(page);
  await expect(opener).toBeEnabled();
  held = new Promise<void>(resolve => { release = resolve; });
  await opener.click();
  await name.press("Enter");
  await expect.poll(() => claims).toBe(3);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
  release();
  await expect(opener).toHaveCount(0);
  expect(claims).toBe(3);
});

test("turn advancement continues in Actions; unmount unlocks scroll without focusing the old table", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  const game = f.current();
  const now = Date.now();
  f.set({ ...game, serverTime: new Date(now).toISOString(), turnTimer: { decisionId: "10000000-0000-4000-8000-000000000000",
    actorEngineId: f.human.id, handNumber: game.poker.handNumber, deadline: new Date(now + 1500).toISOString() } });
  let timeouts = 0;
  await page.route(`**/api/games/${f.gameId}/advance-timeout`, route => {
    timeouts++;
    const current = f.current();
    f.set({ ...current, version: current.version + 1, status: "complete", turnTimer: null,
      poker: { ...current.poker, street: "complete", currentActorId: null, completionReason: "fold", legalActions: [] } });
    return route.fulfill({ json: { game: f.current() } });
  });
  await refresh(page);
  await openActions(page);
  await expect.poll(() => timeouts).toBe(1);
  await expect(actions(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Next Hand", exact: true })).toBeEnabled();
  await openActions(page);
  // Terminal authoritative refresh unmounts the table on this URL.
  await page.route(`**/api/games/${f.gameId}`, route => route.fulfill({ status: 404, json: { error: "Table unavailable" } }));
  await refresh(page);
  await expect(actions(page)).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
  expect(await page.evaluate(() => document.activeElement?.closest('[class*="gameLayout"]') === null)).toBe(true);
  await page.getByRole("link", { name: "Lobby", exact: true }).last().click();
  await expect(page).toHaveURL(/\/play$/);
  expect(await page.evaluate(() => document.activeElement?.isConnected)).toBe(true);
});

const helpDialog = (page: Page) => page.getByRole("dialog", { name: "Game help", exact: true });
async function openHelp(page: Page) {
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(helpDialog(page)).toBeVisible();
  await expect(helpDialog(page).getByRole("button", { name: "Close help", exact: true })).toBeFocused();
}

test("Help contains focus, preserves reading through updates, and blocks gameplay shortcuts", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  const requests: string[] = [];
  page.on("request", r => { if (/\/(action|reveal|next-hand)$/.test(r.url())) requests.push(r.url()); });
  await openHelp(page);
  const dialog = helpDialog(page);
  await contained(page, dialog);
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  const scroll = dialog.locator('[class*="helpScroll"]');
  await scroll.evaluate(n => { n.scrollTop = 300; });
  const reading = await scroll.evaluate(n => n.scrollTop);
  expect(reading).toBeGreaterThan(0);
  await expect(dialog.getByRole("button", { name: "Close help" })).toBeInViewport();
  await dialog.getByRole("heading", { name: "Game help" }).click();
  for (const key of ["a", "s", "d", "q", "e", "ArrowLeft", "ArrowRight", "Shift+E", "Enter", "Space"]) await page.keyboard.press(key);
  await expect(page.locator("#bet-target")).toHaveValue("200");
  expect(requests).toEqual([]);
  f.set({ ...f.current(), version: f.current().version + 1 });
  await refresh(page);
  await expect.poll(() => scroll.evaluate(n => n.scrollTop)).toBe(reading);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(1, 1);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Help", exact: true })).toBeFocused();
  await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
  await page.keyboard.press("e");
  await expect(page.locator("#bet-target")).toHaveValue("300");
  await openHelp(page);
  await expect.poll(() => scroll.evaluate(n => n.scrollTop)).toBe(0);
  await dialog.getByRole("button", { name: "Close help" }).click();
  await expect(page.getByRole("button", { name: "Help", exact: true })).toBeFocused();
  await openHelp(page);
  await page.mouse.click(1, 1);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Help", exact: true })).toBeFocused();
});

test("human turn expiry advances while Help stays open at the reading position", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  await openHelp(page);
  const scroll = helpDialog(page).locator('[class*="helpScroll"]');
  await scroll.evaluate(n => { n.scrollTop = 300; });
  const reading = await scroll.evaluate(n => n.scrollTop);
  const game = f.current();
  const now = Date.now();
  f.set({ ...game, serverTime: new Date(now).toISOString(), turnTimer: { decisionId: "10000000-0000-4000-8000-000000000001",
    actorEngineId: f.human.id, handNumber: game.poker.handNumber, deadline: new Date(now + 1500).toISOString() } });
  let timeouts = 0;
  await page.route(`**/api/games/${f.gameId}/advance-timeout`, route => {
    timeouts++;
    const current = f.current();
    f.set({ ...current, version: current.version + 1, status: "complete", turnTimer: null,
      poker: { ...current.poker, street: "complete", currentActorId: null, completionReason: "fold", legalActions: [] } });
    return route.fulfill({ json: { game: f.current() } });
  });
  await refresh(page);
  await expect.poll(() => timeouts).toBe(1);
  await expect(helpDialog(page)).toBeVisible();
  await expect.poll(() => scroll.evaluate(n => n.scrollTop)).toBe(reading);
  let next = 0, reveals = 0;
  await page.route(`**/api/games/${f.gameId}/next-hand`, route => { next++; return route.fulfill({ json: { game: f.current() } }); });
  await page.route(`**/api/games/${f.gameId}/reveal`, route => { reveals++; return route.fulfill({ json: { game: f.current() } }); });
  await helpDialog(page).getByRole("heading", { name: "Game help" }).click();
  for (const key of ["d", "s", "Enter", "Space"]) await page.keyboard.press(key);
  expect(next).toBe(0); expect(reveals).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Next Hand", exact: true })).toBeEnabled();
  await page.keyboard.press("s");
  await expect.poll(() => next).toBe(1);
});

test("Help opens during a pending action and failed recovery without changing the request", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  let submissions = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/games/${f.gameId}/action`, async route => {
    submissions++;
    await held;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect.poll(() => submissions).toBe(1);
  await openHelp(page);
  await page.route(`**/api/games/${f.gameId}`, route => route.abort("failed"));
  release();
  await expect(page.getByRole("button", { name: "Refresh table", exact: true })).toBeAttached();
  await expect(helpDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await openHelp(page);
  expect(submissions).toBe(1);
});

test("localized Help fits desktop and narrow screens for waiting players and spectators", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page, true);
  // Waiting tables use the same header and server slot; no active table is needed.
  f.set({ ...f.current(), status: "waiting", poker: { ...f.current().poker, currentActorId: null, legalActions: [] } });
  const locales = [
    ["", "Help", "Game help"], ["fi-FI", "Ohje", "Pelin ohje"], ["es-ES", "Ayuda", "Ayuda del juego"],
    ["de-DE", "Hilfe", "Spielhilfe"], ["sv-SE", "Hjälp", "Spelhjälp"], ["fr-FR", "Aide", "Aide du jeu"],
    ["pt-BR", "Ajuda", "Ajuda do jogo"], ["it-IT", "Aiuto", "Aiuto del gioco"], ["nl-NL", "Help", "Spelhulp"],
    ["pl-PL", "Pomoc", "Pomoc w grze"], ["ja-JP", "ヘルプ", "ゲームヘルプ"], ["zh-Hans", "帮助", "游戏帮助"],
  ];
  for (const [locale, label, title] of locales) {
    await page.goto(`${locale ? `/${locale}` : ""}/game/${f.gameId}`);
    const opener = page.getByRole("button", { name: label, exact: true });
    for (const width of [320, 375, 430, 1280]) {
      await page.setViewportSize({ width, height: 812 });
      await expect(opener).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await opener.click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading", { level: 2 })).toHaveCount(4);
      if ((locale === "" || locale === "de-DE") && (width === 320 || width === 1280)) {
        await page.screenshot({ path: `test-results/help-${locale || "en-US"}-${width}.png` });
      }
      const scroll = dialog.locator('[class*="helpScroll"]');
      expect(await scroll.evaluate(n => n.scrollWidth <= n.clientWidth)).toBe(true);
      await scroll.evaluate(n => { n.scrollTop = n.scrollHeight; });
      await expect(dialog.getByRole("button")).toBeInViewport();
      await page.keyboard.press("Escape");
      await expect(opener).toBeFocused();
    }
  }
});
