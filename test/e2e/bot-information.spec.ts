import { expect, test, type Page } from "./fixtures";
import { createUITable } from "./ui-fixtures";
import type { Game } from "../../components/poker/types";

async function fixture(page: Page) {
  const id = await createUITable(page, true);
  const original: Game = (await (await page.request.get(`/api/games/${id}`)).json()).game;
  const human = original.poker.players.find(p => p.controller === "human")!;
  const bots = original.poker.players.filter(p => p.controller === "bot");
  let game: Game = { ...original, version: original.version + 100, poker: { ...original.poker,
    currentActorId: human.id,
    players: original.poker.players.map(p => p.controller === "bot" ? { ...p, name: "Same bot" } : p),
    legalActions: [{ type: "fold" }, { type: "check" }, { type: "raise", minAmount: 200, maxAmount: 1000 }],
  } };
  await page.route(`**/api/games/${id}`, route => route.fulfill({ json: { game } }));
  await page.goto(`/game/${id}`);
  const refresh = async () => {
    const response = page.waitForResponse(r => new URL(r.url()).pathname === `/api/games/${id}`);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await response;
  };
  return { id, human, bots, refresh, current: () => game, update: (patch: Partial<Game>) => { game = { ...game, ...patch, version: game.version + 1 }; } };
}
const dialog = (page: Page) => page.getByRole("dialog", { name: "About this bot", exact: true });
const names = (page: Page) => page.getByRole("button", { name: "About Same bot", exact: true });

test("bot information: desktop and touch layout, keyboard, focus, live metadata and no opening requests", { tag: ["@ui-regression", "@compatibility"] }, async ({ page, isMobile }) => {
  const f = await fixture(page);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 812 });
    const opener = names(page).first();
    await expect(opener).toBeVisible();
    await expect(page.getByRole("button", { name: `About ${f.human.name}`, exact: true })).toHaveCount(0);
    const requests: string[] = [];
    const listen = (r: import("@playwright/test").Request) => { if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(r.url()); };
    page.on("request", listen);
    if (isMobile) await opener.tap();
    else { await opener.focus(); await page.keyboard.press(width === 1280 ? "Enter" : "Space"); }
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(dialog(page)).toContainText("Difficulty: Medium");
    await expect(dialog(page)).not.toContainText("Decisions run locally without external inference");
    await expect(dialog(page)).not.toContainText("The game continues while this dialog is open.");
    expect(requests).toEqual([]);
    page.off("request", listen);
    const link = dialog(page).getByRole("link", { name: "More about the bots (opens in a new tab)" });
    await expect(link).toHaveAttribute("href", "/about");
    await expect(link).toHaveAttribute("target", "_blank");
    for (const key of ["Tab", "Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      expect(await dialog(page).evaluate(d => d.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
    }
    const target = page.locator("#bet-target");
    await dialog(page).getByRole("heading", { level: 2 }).click();
    for (const key of ["a", "s", "d", "e", "ArrowRight", "Enter", "Space"]) await page.keyboard.press(key);
    await expect(target).toHaveValue("200");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog(page).getByRole("button", { name: "Close", exact: true }).focus();
    await page.screenshot({ path: test.info().outputPath(`bot-information-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(opener).toBeFocused();
    await opener.click();
    await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
    await expect(opener).toBeFocused();
    await opener.click(); await page.mouse.click(1, 1);
    await expect(dialog(page)).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
  // Same display name, different immutable participant: update only the selected first bot.
  await names(page).first().click();
  const firstId = f.bots[0].id;
  f.update({ poker: { ...f.current().poker, players: f.current().poker.players.map(p => p.id === firstId ? { ...p, name: "Updated bot", aiDifficulty: "hard" } : p) } });
  await f.refresh();
  await expect(dialog(page).getByRole("heading", { name: "Updated bot" })).toBeVisible();
  await expect(dialog(page)).toContainText("Difficulty: Hard");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "About Updated bot" })).toBeFocused();
  await names(page).first().click();
  await expect(dialog(page)).toContainText("Difficulty: Medium");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "About Updated bot" }).click();
  f.update({ poker: { ...f.current().poker, players: f.current().poker.players.filter(p => p.id !== firstId) } });
  await f.refresh();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Help", exact: true })).toBeFocused();
  await names(page).first().click();
  const nextId = f.current().poker.players.find(p => p.controller === "bot")!.id;
  f.update({ poker: { ...f.current().poker, players: f.current().poker.players.map(p => p.id === nextId ? { ...p, controller: "human", status: "claimed" } : p) } });
  await f.refresh();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Help", exact: true })).toBeFocused();
});

test("bot information remains open through turn expiry and available during pending requests and failed recovery", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const now = Date.now();
  f.update({ serverTime: new Date(now).toISOString(), turnTimer: { decisionId: "10000000-0000-4000-8000-000000000011",
    actorEngineId: f.human.id, handNumber: f.current().poker.handNumber, deadline: new Date(now + 1800).toISOString() } });
  let timeouts = 0;
  await page.route(`**/api/games/${f.id}/advance-timeout`, route => {
    timeouts++; f.update({ turnTimer: null });
    return route.fulfill({ json: { game: f.current() } });
  });
  await f.refresh();
  await names(page).first().click();
  await expect.poll(() => timeouts).toBe(1);
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  let submitted = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/games/${f.id}/action`, async route => { submitted++; await held; await route.abort("failed"); });
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect.poll(() => submitted).toBe(1);
  await names(page).first().click();
  await expect(dialog(page)).toBeVisible();
  await page.route(`**/api/games/${f.id}`, route => route.abort("failed"));
  release();
  await expect(page.getByRole("button", { name: "Refresh table", exact: true })).toBeAttached();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await names(page).first().click();
  await expect(dialog(page)).toBeVisible();
  expect(submitted).toBe(1);
});

test("bot information keeps bot advancement running and shares one overlay with localized dialogs", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 320, height: 390 });
  await names(page).first().click();
  let steps = 0;
  const actor = f.bots[0];
  await page.route(`**/api/games/${f.id}/step`, route => {
    steps++;
    f.update({ poker: { ...f.current().poker, currentActorId: f.human.id,
      players: f.current().poker.players.map(p => p.id === actor.id ? { ...p, stack: 9876 } : p) } });
    return route.fulfill({ json: { game: f.current(), aiDecision: {
      action: "check", amount: null, bot: actor.bot, botProfileId: null,
      probabilities: null, confidence: null, sizing: null, matchedRule: null,
    } } });
  });
  f.update({ poker: { ...f.current().poker, currentActorId: actor.id } });
  await f.refresh();
  await expect.poll(() => steps).toBe(1);
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByText("9,876", { exact: true }).first()).toBeAttached();
  await page.setViewportSize({ width: 320, height: 260 });
  const scroll = dialog(page).locator('[class*="content"]');
  expect(await scroll.evaluate(n => n.scrollHeight > n.clientHeight)).toBe(true);
  await scroll.evaluate(n => { n.scrollTop = n.scrollHeight; });
  await expect(dialog(page).getByRole("button", { name: "Close", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 320, height: 390 });
  await page.keyboard.press("Escape");
  for (const name of ["Help", "Settings", "Expand actions panel"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await names(page).first().click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.goto(`/fi-FI/game/${f.id}`);
  await page.getByRole("button", { name: "Tietoja botista Same bot", exact: true }).first().click();
  const localized = page.getByRole("dialog", { name: "Tietoja tästä botista", exact: true });
  await expect(localized).toBeVisible();
  await expect(localized.getByRole("link")).toHaveAttribute("href", "/fi-FI/about");
  await expect(localized).not.toContainText("Peli jatkuu tämän ikkunan ollessa auki.");
  const [about] = await Promise.all([page.waitForEvent("popup"), localized.getByRole("link").click()]);
  await expect(about).toHaveURL(/\/fi-FI\/about$/);
  await expect(page).toHaveURL(new RegExp(`/fi-FI/game/${f.id}$`));
  await expect(localized).toBeVisible();
  await about.close();
});
