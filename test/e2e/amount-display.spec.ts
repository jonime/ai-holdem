import { scanAccessibility } from "./accessibility";
import { createUITable } from "./ui-fixtures";
import { completed } from "./replay-fixtures";
import { expect, test, type Page } from "./fixtures";
import type { Game } from "../../components/poker/types";
import { replayResponseSchema } from "../../lib/http/replay-contracts";
import { formatAmount } from "../../components/poker/amounts";
import { sharedReplaySchema } from "../../lib/http/share-contracts";

async function display(page: Page, mode: "chips" | "bigBlinds") {
  await page.evaluate(value => {
    const key = "ai-holdem-settings";
    const next = { version: 1, turnSound: false, gameplayShortcuts: true, ...JSON.parse(localStorage.getItem(key) ?? "{}"), amountDisplay: value };
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: JSON.stringify(next), storageArea: localStorage }));
  }, mode);
}

test("BB presentation preserves chip drafts, focus, presets, shortcuts and exact submissions", { tag: "@ui-regression" }, async ({ page }) => {
  await page.goto("/play");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const setting = page.getByRole("combobox", { name: "Amount display", exact: true });
  await expect(setting).toHaveValue("chips");
  await setting.focus();
  await setting.selectOption("bigBlinds");
  await expect(setting).toBeFocused();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const id = await createUITable(page, true);
  const original: Game = (await (await page.request.get(`/api/games/${id}`)).json()).game;
  const human = original.poker.players.find(p => p.controller === "human")!;
  let game: Game = { ...original, poker: { ...original.poker, bigBlind: 100, pot: 150, currentActorId: human.id,
    legalActions: [{ type: "fold" }, { type: "call", amount: 50 }, { type: "raise", minAmount: 200, maxAmount: 10000 }] } };
  const actions: unknown[] = [];
  await page.route(`**/api/games/${id}`, route => route.fulfill({ json: { game } }));
  await page.route(`**/api/games/${id}/action`, route => {
    actions.push(route.request().postDataJSON().action);
    game = { ...game, version: game.version + 1 };
    return route.fulfill({ json: { game } });
  });
  await page.goto(`/game/${id}`);
  const input = page.locator("#bet-target");
  await expect(input).toHaveAccessibleName("Bet amount (chips)");
  await expect(page.getByRole("slider")).toHaveAccessibleName("Bet amount (chips)");
  await expect(page.getByRole("button", { name: "Call 0.5 big blinds", exact: true })).toBeEnabled();
  await expect(page.locator('[class*="pot"] strong')).toContainText("1.5 BB");
  await expect(page.locator('[data-hand-announcement]')).toContainText("Pot 1.5 big blinds");
  await input.fill("333"); await input.focus();
  const announcement = await page.locator('[data-hand-announcement]').textContent();
  await display(page, "chips");
  await expect(input).toHaveValue("333"); await expect(input).toBeFocused();
  await expect(input).toHaveAccessibleName("Bet amount");
  await display(page, "bigBlinds");
  await expect(input).toHaveValue("333"); await expect(input).toBeFocused();
  await expect(page.locator('[data-hand-announcement]')).toHaveText(announcement!);
  await expect(page.locator('#bet-equivalent')).toContainText("3.33 BB");
  await input.fill("199");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAttribute("aria-describedby", "bet-addition");
  await expect(page.getByRole("button", { name: /^Raise to/ })).toBeDisabled();
  await input.fill("333");
  const presets = ["50% pot", "75% pot", "Pot", "All-in"];
  const targets: string[] = [];
  for (const mode of ["chips", "bigBlinds"] as const) {
    await display(page, mode);
    for (const [i, name] of presets.entries()) {
      await page.getByRole("button", { name, exact: true }).click();
      if (mode === "chips") targets.push(await input.inputValue());
      else expect(await input.inputValue()).toBe(targets[i]);
    }
    await input.fill("333");
    await page.locator("main").click({ position: { x: 1, y: 1 } });
    await page.keyboard.press("e"); await expect(input).toHaveValue("433");
    await page.keyboard.press("Shift+Q"); await expect(input).toHaveValue("200");
    await input.fill("333");
    if (mode === "chips") await page.getByRole("button", { name: "Raise to 333", exact: true }).click();
    else { await page.locator("main").click({ position: { x: 1, y: 1 } }); await page.keyboard.press("d"); }
    await expect.poll(() => actions.length).toBe(mode === "chips" ? 1 : 2);
  }
  expect(actions).toEqual([{ type: "raise", amount: 333 }, { type: "raise", amount: 333 }]);
  await scanAccessibility(page, "big-blind-live");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(input).toBeVisible();
  await expect(page.locator("#bet-equivalent")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("big-blinds-mobile.png"), fullPage: true });
});

test("results, Actions and both replay viewers use historical blinds with legacy fallback", { tag: "@ui-regression" }, async ({ browser, page }) => {
  const f = await completed(browser, page);
  try {
    const { replay } = replayResponseSchema.parse(await (await page.request.get(`/api/games/${f.id}/hands/1/replay`)).json());
    expect(replay.bigBlind).toBeGreaterThan(0);
    const player = replay.participants[0];
    await page.route(`**/api/games/${f.id}/feed*`, route => route.fulfill({ json: { feed: { events: [
      { type: "handStarted", handNumber: 1, bigBlind: 10 },
      { type: "win", handNumber: 1, player: player.name, playerId: null, amount: 100, uncontested: true },
      { type: "handStarted", handNumber: 2, bigBlind: 20 },
      { type: "win", handNumber: 2, player: player.name, playerId: null, amount: 100, uncontested: true },
      { type: "handStarted", handNumber: 3 },
      { type: "win", handNumber: 3, player: player.name, playerId: null, amount: 100, uncontested: true },
    ] } } }));
    await page.reload(); await display(page, "bigBlinds");
    const settled = (await f.read()).poker;
    for (const award of Object.values(settled.winnerAmounts)) {
      await expect(page.locator("[data-hand-result]")).toContainText(formatAmount(award, "en-US", "bigBlinds", settled.bigBlind));
    }
    await expect(page.locator("[data-personal-result]")).toContainText(formatAmount(Math.abs(settled.viewerHandResult!.netChange), "en-US", "bigBlinds", settled.bigBlind));
    const panel = page.getByRole("complementary", { name: "Actions", exact: true });
    const hands = panel.locator("section");
    await expect(hands.nth(0)).toContainText("10 BB");
    await expect(hands.nth(1)).toContainText("5 BB");
    await expect(hands.nth(2)).toContainText("100 chips");
    await hands.nth(0).getByRole("button", { name: "Review", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Review hand", exact: true });
    await expect(dialog.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "0");
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await expect(dialog.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "1");
    const announced = await dialog.locator("[data-replay-announcement]").textContent();
    await display(page, "chips"); await display(page, "bigBlinds");
    await expect(dialog.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "1");
    await expect(dialog.locator("[data-replay-announcement]")).toHaveText(announced!);
    await dialog.getByRole("button", { name: "Preflop", exact: true }).click();
    await expect(dialog.locator("[data-replay-bet]").first()).toContainText(formatAmount(replay.frames[0].players.find(p => p.bet > 0)!.bet, "en-US", "bigBlinds", replay.bigBlind));
    await expect(dialog.locator("[data-replay-stack]").first()).toContainText(formatAmount(replay.frames[0].players[0].stack, "en-US", "bigBlinds", replay.bigBlind));
    await scanAccessibility(page, "big-blind-replay");
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const { bigBlind } = replay;
    const snapshot = { dealerSeat: replay.dealerSeat, smallBlindSeat: replay.smallBlindSeat, bigBlindSeat: replay.bigBlindSeat,
      participants: replay.participants, frames: replay.frames, pots: replay.pots };
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.route(`**/api/games/${f.id}/hands/1/replay`, route => route.fulfill({ json: { replay: { ...snapshot, gameId: f.id, handNumber: 1 } } }));
    // Mobile Actions opens as a dialog; keep the same desktop panel for this check.
    await page.setViewportSize({ width: 1280, height: 900 });
    await hands.nth(0).getByRole("button", { name: "Review", exact: true }).click();
    await expect(dialog.getByText("Amounts shown in chips; blind size unavailable", { exact: true })).toBeVisible();
    await expect(dialog.locator("[data-replay-stack]").first()).toContainText("chips");
    const token = "a".repeat(64);
    await page.setViewportSize({ width: 375, height: 812 });
    for (const historical of [true, false]) {
      const shared = sharedReplaySchema.parse({ schemaVersion: 1, replay: { ...snapshot, ...(historical ? { bigBlind } : {}) } });
      await page.route(`**/api/replays/${token}`, route => route.fulfill({ json: shared }));
      await page.goto(`/replay/${token}`);
      await expect(page.locator("[data-replay-stack]").first()).toContainText(formatAmount(snapshot.frames[0].players[0].stack, "en-US", "bigBlinds", historical ? bigBlind : undefined));
      if (!historical) await expect(page.getByText("Amounts shown in chips; blind size unavailable", { exact: true })).toBeVisible();
      await scanAccessibility(page, historical ? "big-blind-shared" : "legacy-chip-shared");
    }
  } finally { await f.guestContext.close(); }
});
