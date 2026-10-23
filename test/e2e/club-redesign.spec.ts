import { completed } from "./replay-fixtures";
import { createUITable } from "./ui-fixtures";
import { expect, test, type Page } from "./fixtures";
import type { Game } from "../../components/poker/types";
import { scanAccessibility } from "./accessibility";

const sizes = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }];
async function appearance(page: Page, theme: "light" | "dark") {
  if (await page.locator("html").getAttribute("data-theme") !== theme) {
    const toggle = page.getByRole("button", { name: /^Appearance:/ }).last();
    if (await toggle.count()) await toggle.click();
    else await page.getByRole("combobox", { name: "Appearance", exact: true }).last().selectOption(theme);
  }
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}
async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

test("public routes, themes, first paint, persistence and System changes", { tag: "@ui-regression" }, async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await appearance(page, "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const other = await context.newPage(); await other.goto("/");
  await appearance(page, "dark");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() => { localStorage.removeItem("ai-holdem-theme"); });
  await page.reload();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await other.close();
  for (const path of ["/", "/about", "/developers", "/play", "/play?tab=public", "/play?tab=shared", "/does-not-exist"]) {
    await page.goto(path);
    for (const theme of ["light", "dark"] as const) {
      await appearance(page, theme);
      for (const size of [sizes[0], sizes[2], sizes[3]]) {
        await page.setViewportSize(size);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await screenshot(page, `public-${path.replace(/\W/g, "_")}-${theme}-${size.width}`);
      }
      if (path === "/") await scanAccessibility(page, `landing-${theme}`);
    }
  }
  // Block hydration bundles: the inline head script must still apply stored appearance.
  await page.route("**/_next/static/**/*.js", route => route.abort());
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("perimeter geometry and usable betting controls for every seat count and viewport", { tag: "@ui-regression" }, async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/play");
  const gameId = await createUITable(page, true);
  const original: Game = (await (await page.request.get(`/api/games/${gameId}`)).json()).game;
  const human = original.poker.players.find(p => p.controller === "human")!;
  let game = original;
  await page.route(`**/api/games/${gameId}`, route => route.fulfill({ json: { game } }));
  await page.route(`**/api/games/${gameId}/feed*`, route => route.fulfill({ json: { feed: { events: [] } } }));
  await page.goto(`/game/${gameId}`);
  for (const count of [2, 3, 4, 5, 6]) {
    const players = original.poker.players.slice(0, count).map(p => ({ ...p, name: p.id === human.id ? "Player 1" : "Pitkä paikallinen pelaajanimi", holeCards: p.id === human.id ? ["As", "Qh"] : null }));
    game = { ...original, version: original.version + count, turnTimer: null, poker: { ...original.poker, players, seats: players, seatCount: count,
      currentActorId: human.id, communityCards: ["Ah", "7c", "2s"], street: "flop", legalActions: [{ type: "fold" }, { type: "call", amount: 100 }, { type: "raise", minAmount: 300, maxAmount: 1000 }] } };
    await page.reload();
    await expect(page.locator("[data-table-seat]")).toHaveCount(count);
    for (const theme of ["light", "dark"] as const) {
      await appearance(page, theme);
      for (const size of sizes) {
        await page.setViewportSize(size);
        await page.getByRole("button", { name: /^Raise to/ }).scrollIntoViewIfNeeded();
        const geometry = await page.locator("[data-table-seat]").evaluateAll(nodes => nodes.map(n => { const r=n.getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom }; }));
        for (let i=0;i<geometry.length;i++) for (let j=i+1;j<geometry.length;j++) {
          const a=geometry[i],b=geometry[j];
          expect(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `${count} seats at ${size.width}x${size.height}`).toBe(true);
        }
        const dock = await page.getByRole("button", { name: /^Raise to/ }).boundingBox();
        expect(dock!.x).toBeGreaterThanOrEqual(0); expect(dock!.y).toBeGreaterThanOrEqual(0);
        expect(dock!.y + dock!.height).toBeLessThanOrEqual(size.height + 1);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await screenshot(page, `game-${count}-${theme}-${size.width}x${size.height}`);
      }
      if (count === 6) await scanAccessibility(page, `game-${theme}`);
    }
  }
  // Theme changes must preserve the pending bet draft.
  const input = page.locator("#bet-target"); await input.fill("425");
  await appearance(page, "light"); await expect(input).toHaveValue("425");
  await page.setViewportSize(sizes[2]);
  for (const button of ["Settings", "Share", "Help", "Stats"]) {
    await page.getByRole("button", { name: button, exact: true }).first().click();
    const dialog = page.getByRole("dialog").last(); await expect(dialog).toBeVisible();
    if (button === "Help") {
      const location = page.url();
      await dialog.getByRole("link", { name: "Hand rankings", exact: true }).click();
      expect(page.url()).toBe(location);
    }
    await screenshot(page, `overlay-${button.toLowerCase()}-light`);
    await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
  }
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Appearance", exact: true }).selectOption("dark");
  await screenshot(page, "overlay-settings-dark");
  await page.keyboard.press("Escape");
  for (const button of ["Share", "Help", "Stats"]) {
    await page.getByRole("button", { name: button, exact: true }).first().click();
    await screenshot(page, `overlay-${button.toLowerCase()}-dark`); await page.keyboard.press("Escape");
  }
});


test("waiting, completed, populated results, replay and revoked replay in both themes", { tag: "@ui-regression" }, async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.goto("/play");
  const waitingId = await createUITable(page);
  await page.goto(`/game/${waitingId}`);
  for (const theme of ["light", "dark"] as const) {
    await appearance(page, theme);
    for (const size of [sizes[0], sizes[2]]) {
      await page.setViewportSize(size);
      await screenshot(page, `waiting-${theme}-${size.width}`);
    }
  }
  const f = await completed(browser, page);
  try {
    for (const theme of ["light", "dark"] as const) {
      await appearance(page, theme);
      for (const size of [sizes[0], sizes[2]]) {
        await page.setViewportSize(size);
        await screenshot(page, `completed-${theme}-${size.width}`);
        await page.getByRole("button", { name: "Stats", exact: true }).click();
        const stats = page.getByRole("dialog", { name: "Stats", exact: true });
        await expect(stats.locator("dd").first()).toHaveText("1");
        await screenshot(page, `populated-results-${theme}-${size.width}`);
        await stats.getByRole("button", { name: "Review", exact: true }).last().click();
        const replay = page.getByRole("dialog", { name: "Review hand", exact: true });
        await expect(replay.locator("[data-replay-frame]")).toBeVisible();
        await screenshot(page, `replay-${theme}-${size.width}`);
        await replay.getByRole("button", { name: "Result", exact: true }).click();
        await screenshot(page, `replay-result-${theme}-${size.width}`);
        await page.keyboard.press("Escape");
        await expect(stats).toBeVisible(); await page.keyboard.press("Escape");
      }
    }
    const response = await page.request.post(`/api/games/${f.id}/hands/1/share`, { headers: { origin: new URL(page.url()).origin } });
    expect(response.ok()).toBe(true);
    const { share } = await response.json();
    await page.goto(`/replay/${share.token}`);
    await expect(page.locator("[data-replay-frame]")).toBeVisible();
    for (const theme of ["light", "dark"] as const) {
      await appearance(page, theme);
      await screenshot(page, `shared-replay-${theme}`);
    }
    const revoke = await page.request.delete(`/api/replays/owned/${share.token}`, { headers: { origin: new URL(page.url()).origin } });
    expect(revoke.ok()).toBe(true);
    await page.reload(); await expect(page.locator("[data-replay-frame]")).toHaveCount(0);
    for (const theme of ["light", "dark"] as const) { await appearance(page, theme); await screenshot(page, `revoked-replay-${theme}`); }
  } finally { await f.guestContext.close(); }
});

test("spectator, Join, bot information, Actions and paused recovery states in both themes", { tag: "@ui-regression" }, async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/play");
  const id = await createUITable(page, true);
  const original: Game = (await (await page.request.get(`/api/games/${id}`)).json()).game;
  const human = original.poker.players.find(p => p.controller === "human")!;
  const bot = original.poker.players.find(p => p.controller === "bot")!;
  let game: Game = { ...original, version: original.version + 100, turnTimer: null,
    poker: { ...original.poker, currentActorId: human.id, legalActions: [{ type: "fold" }, { type: "check" }] } };
  let failRead = false;
  await page.route(`**/api/games/${id}`, route => failRead ? route.abort("failed") : route.fulfill({ json: { game } }));
  await page.route(`**/api/games/${id}/feed*`, route => route.fulfill({ json: { feed: { events: [] } } }));
  await page.setViewportSize(sizes[2]);
  await page.goto(`/game/${id}`);
  for (const theme of ["light", "dark"] as const) {
    await appearance(page, theme);
    await page.getByRole("button", { name: `About ${bot.name}`, exact: true }).click();
    await screenshot(page, `bot-information-${theme}`); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Expand actions panel$/ }).click();
    await expect(page.getByRole("dialog", { name: "Actions", exact: true })).toBeVisible();
    await screenshot(page, `actions-${theme}`); await page.keyboard.press("Escape");
  }
  await page.route(`**/api/games/${id}/action`, async route => { failRead = true; await route.abort("failed"); });
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh table", exact: true })).toBeVisible();
  for (const theme of ["light", "dark"] as const) { await appearance(page, theme); await screenshot(page, `unknown-outcome-${theme}`); }
  failRead = false;
  await page.getByRole("button", { name: "Refresh table", exact: true }).click();
  game = { ...game, version: game.version + 1, poker: { ...game.poker, currentActorId: bot.id } };
  await page.route(`**/api/games/${id}/step`, route => route.fulfill({ status: 502, json: { error: "AI decision failed", code: "BOT_TIMEOUT" } }));
  await page.reload();
  await expect(page.locator("main").getByRole("alert")).toContainText("Play is paused");
  for (const theme of ["light", "dark"] as const) { await appearance(page, theme); await screenshot(page, `bot-paused-${theme}`); }
  game = { ...game, version: game.version + 1, viewerIsHost: false, poker: { ...game.poker,
    currentActorId: human.id,
    players: game.poker.players.map(p => ({ ...p, playerToken: null, holeCards: null })),
    seats: game.poker.players.map(p => ({ ...p, playerToken: null, holeCards: null, ...(p.id === bot.id ? { controller: "human" as const, status: "open" as const, bot: null } : {}) })),
  } };
  await page.reload();
  for (const theme of ["light", "dark"] as const) {
    await appearance(page, theme); await screenshot(page, `spectator-${theme}`);
    await page.getByRole("button", { name: "Sit in an open seat", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Join the table", exact: true })).toBeVisible();
    await screenshot(page, `join-${theme}`); await page.keyboard.press("Escape");
  }
  await page.goto("/play");
  for (const theme of ["light", "dark"] as const) {
    await appearance(page, theme);
    await page.getByRole("button", { name: /^Delete table:/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await screenshot(page, `delete-confirmation-${theme}`);
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  }
});
