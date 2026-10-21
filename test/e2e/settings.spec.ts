import { expect, test, type Page } from "./fixtures";
import { createUITable } from "./ui-fixtures";
import type { Game } from "../../components/poker/types";
async function table(page: Page) {
  const id = await createUITable(page, true);
  const original: Game = (await (await page.request.get(`/api/games/${id}`)).json()).game;
  const human = original.poker.players.find(p => p.controller === "human")!;
  let game: Game = { ...original, poker: { ...original.poker, currentActorId: human.id,
    legalActions: [{ type: "fold" }, { type: "check" }, { type: "raise", minAmount: 200, maxAmount: 10000 }] } };
  await page.route(`**/api/games/${id}`, route => route.fulfill({ json: { game } }));
  await page.goto(`/game/${id}`);
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeEnabled();
  return { id, get: () => game, set: (next: Game) => { game = next; } };
}
async function open(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
}
test("Settings focus, scrolling, shortcuts, native controls and mobile layout", { tag: "@ui-regression" }, async ({ page }) => {
  await table(page);
  let actions = 0;
  await page.route("**/action", route => { actions++; return route.abort(); });
  await open(page);
  await page.keyboard.press("s"); expect(actions).toBe(0);
  await expect(page).toHaveTitle(/Your turn/);
  await page.screenshot({ path: test.info().outputPath("settings-desktop.png") });
  for (const key of ["Shift+Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "Tab"]) {
    await page.keyboard.press(key);
    expect(await page.getByRole("dialog").evaluate(d => d.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  }
  await page.getByRole("switch", { name: "Gameplay shortcuts", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeFocused();
  await expect(page.locator("[aria-keyshortcuts]")).toHaveCount(0);
  await expect(page.locator("kbd")).toHaveCount(0);
  await page.keyboard.press("s"); expect(actions).toBe(0);
  const slider = page.getByRole("slider"); const amount = page.getByRole("spinbutton", { name: "Bet amount", exact: true });
  await slider.focus(); await page.keyboard.press("ArrowRight"); await expect(amount).toHaveValue("201");
  await page.keyboard.press("Shift+ArrowRight"); await expect(amount).toHaveValue("202");
  await amount.fill("300"); await page.keyboard.press("q"); await expect(amount).toHaveValue("300");
  await open(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: test.info().outputPath("settings-mobile.png") });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const dialog = page.getByRole("dialog"); const rect = await dialog.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
  await page.getByRole("switch", { name: "Gameplay shortcuts", exact: true }).click();
  await page.keyboard.press("Escape"); await expect(slider).toHaveAttribute("aria-keyshortcuts", /Q E/);
  await slider.focus(); await page.keyboard.press("Shift+ArrowRight"); await expect(amount).toHaveValue("800");
  await page.reload(); await expect(slider).toHaveAttribute("aria-keyshortcuts", /Q E/);
  await open(page); await page.mouse.click(1,1); await expect(dialog).not.toBeVisible();
});
const languageSuffixes = [
  { name: "ordinary suffix", suffix: "?test=settings#table" },
  { name: "script schemes", suffix: "?next=javascript:globalThis.__settingsXssProbe()#javascript:globalThis.__settingsXssProbe()" },
  { name: "external URLs", suffix: "?next=https://evil.example/#//evil.example/" },
  { name: "encoded controls", suffix: "?next=%0d%0a%09javascript:globalThis.__settingsXssProbe()#%0a%0d%09javascript:globalThis.__settingsXssProbe()" },
  { name: "HTML and data URL", suffix: "?html=<svg/onload=globalThis.__settingsXssProbe()>#data:text/html,<script>globalThis.__settingsXssProbe()</script>" },
];
for (const { name, suffix } of languageSuffixes) {
  test(`language keeps table, ownership and inert URL suffixes: ${name}`, { tag: ["@ui-regression", "@compatibility"] }, async ({ page }) => {
    let executions = 0;
    await page.exposeFunction("__settingsXssProbe", () => { executions++; });
    const f = await table(page);
    const owner = (await page.context().cookies()).find(c => c.name === "ai-holdem-player-id")?.value;
    expect(owner).toBeTruthy();
    const origin = new URL(page.url()).origin;
    const externalNavigations: string[] = [];
    page.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame() && new URL(request.url()).origin !== origin) {
        externalNavigations.push(request.url());
      }
    });
    await page.goto(`/game/${f.id}${suffix}`);
    // Compare the browser's serialized suffix, including normal percent encoding.
    const initial = new URL(page.url());
    const assertDestination = async (pathname: string) => {
      const expected = new URL(initial.href); expected.pathname = pathname;
      await expect(page).toHaveURL(expected.href);
      const actual = new URL(page.url());
      expect(actual.origin).toBe(origin);
      expect(actual.pathname).toBe(pathname);
      expect(actual.search).toBe(initial.search);
      expect(actual.hash).toBe(initial.hash);
      expect((await page.context().cookies()).find(c => c.name === "ai-holdem-player-id")?.value).toBe(owner);
      expect(executions).toBe(0);
      expect(externalNavigations).toEqual([]);
    };
    await open(page);
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("fi-FI");
    await expect(page.getByRole("button", { name: "Asetukset", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Kippaa", exact: true })).toBeEnabled();
    await assertDestination(`/fi-FI/game/${f.id}`);
    await page.getByRole("button", { name: "Asetukset", exact: true }).click();
    await page.getByRole("combobox", { name: "Kieli", exact: true }).selectOption("en-US");
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fold", exact: true })).toBeEnabled();
    await assertDestination(`/game/${f.id}`);
  });
}
test("Settings stays usable during pending actions and failed recovery, with language blocked", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await table(page);
  await page.route(`**/api/games/${f.id}/action`, () => {});
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await open(page);
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeDisabled();
  await page.getByRole("switch", { name: "Gameplay shortcuts", exact: true }).click();
  await page.route(`**/api/games/${f.id}`, route => route.abort());
  await expect(page.getByRole("button", { name: "Refresh table", exact: true })).toBeAttached({ timeout: 20_000 });
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Turn sound", exact: true })).toBeEnabled();
});
test("storage changes synchronize without previews and game refresh continues in Settings", { tag: "@ui-regression" }, async ({ page }) => {
  await page.addInitScript(() => {
    const value = window as unknown as { audioAttempts: number; AudioContext: unknown };
    value.audioAttempts = 0;
    value.AudioContext = class { constructor() { value.audioAttempts++; throw new Error("No gesture"); } };
  });
  const f = await table(page); await open(page);
  const other = await page.context().newPage();
  await other.goto(`/game/${f.id}`);
  await other.evaluate(() => localStorage.setItem("ai-holdem-settings", JSON.stringify({ version: 1, turnSound: true, gameplayShortcuts: false, cardColours: "four-colour", showCurrentHand: false, amountDisplay: "bigBlinds" })));
  await page.evaluate(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: "ai-holdem-settings", newValue: JSON.stringify({ version: 1, turnSound: true, gameplayShortcuts: false, cardColours: "four-colour", showCurrentHand: false, amountDisplay: "bigBlinds" }), storageArea: localStorage }));
  });
  await expect(page.getByRole("switch", { name: "Turn sound", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Gameplay shortcuts", exact: true })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: "Show current hand", exact: true })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("combobox", { name: "Card colours", exact: true })).toHaveValue("four-colour");
  await expect(page.getByRole("combobox", { name: "Amount display", exact: true })).toHaveValue("bigBlinds");
  expect(await page.evaluate(() => (window as unknown as { audioAttempts: number }).audioAttempts)).toBe(0);
  f.set({ ...f.get(), version: f.get().version + 1, poker: { ...f.get().poker, handNumber: 42 } });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Hand 42", { exact: true })).toBeAttached();
  await expect(page.getByRole("dialog")).toBeVisible();
  await other.evaluate(() => localStorage.removeItem("ai-holdem-settings"));
  await other.close();
  await expect(page.getByRole("combobox", { name: "Amount display", exact: true })).toHaveValue("chips");
  await expect(page.getByRole("switch", { name: "Show current hand", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("combobox", { name: "Card colours", exact: true })).toHaveValue("classic");
  await expect(page.getByRole("switch", { name: "Turn sound", exact: true })).toHaveAttribute("aria-checked", "false");
});

test("language waits for bot advancement and Quick Play creation", { tag: "@ui-regression" }, async ({ page }) => {
  const f = await table(page);
  let steps = 0;
  await page.route(`**/api/games/${f.id}/step`, () => { steps++; });
  const bot = f.get().poker.players.find(p => p.controller === "bot")!;
  f.set({ ...f.get(), version: f.get().version + 1, poker: { ...f.get().poker, currentActorId: bot.id } });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => steps).toBe(1);
  await open(page); await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Gameplay shortcuts", exact: true })).toBeEnabled();
  // A fresh visit fences the pending advancement before rendering a finished table.
  const human = f.get().poker.players.find(p => p.controller === "human")!;
  f.set({ ...f.get(), status: "complete", poker: { ...f.get().poker, street: "complete", currentActorId: null,
    legalActions: [], players: f.get().poker.players.map(p => ({ ...p, stack: p.id === human.id ? 0 : p.stack })) } });
  await page.reload();
  let creations = 0;
  await page.route("**/quick-game", () => { creations++; });
  await page.getByRole("button", { name: "New Quick Play", exact: true }).click();
  await expect.poll(() => creations).toBe(1);
  await open(page); await expect(page.getByRole("combobox", { name: "Language", exact: true })).toBeDisabled();
});

test("card colours persist and cover table, winning five, Actions and Help", { tag: ["@ui-regression", "@compatibility"] }, async ({ page }) => {
  const f = await table(page);
  const palette = page.locator("[data-card-colours]");
  await expect(palette).toHaveAttribute("data-card-colours", "classic");
  const backs = page.locator('[data-playing-card][aria-label="Hidden card"]');
  const placeholders = page.locator('[data-playing-card][aria-hidden="true"]');
  const beforeBacks = await backs.evaluateAll(nodes => nodes.map(n => n.outerHTML));
  const beforePlaceholders = await placeholders.evaluateAll(nodes => nodes.map(n => n.outerHTML));
  const beforeDimensions = await page.locator("[data-playing-card]").first().boundingBox();
  let actions = 0;
  await page.route("**/action", route => { actions++; return route.abort(); });
  await open(page);
  const select = page.getByRole("combobox", { name: "Card colours", exact: true });
  await expect(select).toHaveValue("classic");
  await select.selectOption("four-colour");
  await expect(palette).toHaveAttribute("data-card-colours", "four-colour");
  expect(await backs.evaluateAll(nodes => nodes.map(n => n.outerHTML))).toEqual(beforeBacks);
  expect(await placeholders.evaluateAll(nodes => nodes.map(n => n.outerHTML))).toEqual(beforePlaceholders);
  const afterDimensions = await page.locator("[data-playing-card]").first().boundingBox();
  expect(afterDimensions?.width).toBe(beforeDimensions?.width);
  expect(afterDimensions?.height).toBe(beforeDimensions?.height);
  await page.screenshot({ path: test.info().outputPath("four-colour-settings.png") });
  await page.reload(); await expect(palette).toHaveAttribute("data-card-colours", "four-colour");
  const cards = ["As", "Kh", "Qd", "Jc", "Ts"];
  const human = f.get().poker.players.find(p => p.controller === "human")!;
  f.set({ ...f.get(), version: f.get().version + 1, status: "complete", poker: { ...f.get().poker,
    street: "complete", currentActorId: null, legalActions: [], communityCards: cards,
    completionReason: "showdown", winnerIds: [human.id], winnerAmounts: { [human.id]: 100 },
    players: f.get().poker.players.map(p => p.id === human.id ? { ...p, holeCards: ["As", "Kh"],
      bestHand: "straight", winningHand: { cards, playsBoard: false } } : p) } });
  await page.route(`**/api/games/${f.id}/feed*`, route => route.fulfill({ json: { feed: { events: [
    { type: "handStarted", handNumber: f.get().poker.handNumber },
    { type: "street", handNumber: f.get().poker.handNumber, street: "river", cards },
  ] } } }));
  await page.reload();
  const winning = page.locator("[data-winning-hand]");
  await expect(winning).toBeVisible();
  const colours = { s: "rgb(24, 36, 36)", h: "rgb(179, 61, 44)", d: "rgb(24, 86, 160)", c: "rgb(33, 99, 62)" };
  async function inspect(scope: ReturnType<Page["locator"]>, four = true) {
    for (const suit of ["s", "h", "d", "c"] as const) {
      const card = scope.locator(`[data-suit="${suit}"]`).first();
      await expect(card).toBeAttached();
      await expect(card).toHaveCSS("color", four ? colours[suit] : suit === "h" || suit === "d" ? colours.h : colours.s);
    }
  }
  await inspect(page.locator("main")); await inspect(winning);
  const names = await winning.locator("[data-playing-card]").evaluateAll(nodes => nodes.map(n => n.getAttribute("aria-label")));
  const underline = await winning.locator('[data-hole-card="true"]').first().evaluate(n => getComputedStyle(n).borderBottom);
  const mobile = test.info().project.name === "webkit-mobile";
  if (!mobile) await page.setViewportSize({ width: 1280, height: 900 });
  if (mobile) await page.getByRole("button", { name: /(Collapse|Expand) actions panel$/ }).click();
  await inspect(page.getByRole(mobile ? "dialog" : "complementary", { name: "Actions", exact: true }));
  if (mobile) await page.keyboard.press("Escape");
  await page.screenshot({ path: test.info().outputPath("four-colour-table-results.png"), fullPage: true });
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await inspect(page.getByRole("dialog"));
  await expect(page.locator("[data-card-example]").first()).toContainText("9♠ 8♠ 7♠ 6♠ 5♠");
  await page.screenshot({ path: test.info().outputPath("four-colour-help.png") });
  await page.keyboard.press("Escape");
  if (!mobile) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: /(Collapse|Expand) actions panel$/ }).click();
    await inspect(page.getByRole("dialog", { name: "Actions", exact: true }));
    await page.screenshot({ path: test.info().outputPath("four-colour-actions-mobile.png") });
    await page.keyboard.press("Escape");
  }
  await open(page); await select.selectOption("classic");
  await expect(palette).toHaveAttribute("data-card-colours", "classic");
  await inspect(winning, false);
  expect(await winning.locator("[data-playing-card]").evaluateAll(nodes => nodes.map(n => n.getAttribute("aria-label")))).toEqual(names);
  expect(await winning.locator('[data-hole-card="true"]').first().evaluate(n => getComputedStyle(n).borderBottom)).toEqual(underline);
  await page.keyboard.press("Escape");
  await inspect(page.locator("main"), false);
  await page.getByRole("button", { name: /(Collapse|Expand) actions panel$/ }).click();
  await inspect(page.getByRole("dialog", { name: "Actions", exact: true }), false);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Help", exact: true }).click(); await inspect(page.getByRole("dialog"), false);
  await page.keyboard.press("Escape"); await page.reload();
  await expect(palette).toHaveAttribute("data-card-colours", "classic");
  expect(actions).toBe(0);
});

test("current hand keeps category and turn status separate on desktop and mobile", { tag: ["@ui-regression", "@compatibility"] }, async ({ page }) => {
  // Use the committed logo directly: rapid viewport changes can cancel responsive
  // optimizer requests, which should not make status/layout screenshots flaky.
  await page.route(/\/_next\/image\?.*ai-holdem-logo/, route =>
    route.fulfill({ path: `${process.cwd()}/public/ai-holdem-logo.png`, contentType: "image/png" }));
  const f = await table(page);
  const human = f.get().poker.players.find(p => p.controller === "human")!;
  const caller = f.get().poker.players.find(p => p.controller === "bot")!;
  let callerAction: "call" | "bet" | "raise" = "call";
  await page.route(`**/api/games/${f.id}/feed*`, route => route.fulfill({ json: { feed: { events: [
    { type: "handStarted", handNumber: f.get().poker.handNumber },
    { type: "action", handNumber: f.get().poker.handNumber, player: caller.name, playerId: caller.id,
      controller: "bot", action: callerAction, amount: 100, street: "flop" },
  ] } } }));
  await page.reload();
  async function equalSeats() {
    const seats = page.locator("[data-hand-category-slot]:visible").locator("xpath=ancestor::section[1]");
    await expect(seats).toHaveCount(6);
    const boxes = await seats.evaluateAll(nodes => nodes.map(n => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })));
    for (const box of boxes) {
      expect(box.height).toBe(boxes[0].height);
      expect(box.width).toBe(boxes[0].width);
    }
    expect(boxes[0].height).toBe(page.viewportSize()!.width <= 560 ? 110 : 170);
    return boxes;
  }
  async function capture(name: string) {
    await expect.poll(() => page.locator("[data-playing-card]:visible img").evaluateAll(images =>
      images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: test.info().outputPath(name), fullPage: true });
  }
  await equalSeats();
  const line = page.locator("[data-current-hand]:visible");
  await expect(line).toHaveCount(1);
  await expect(line).toHaveAttribute("aria-hidden", "true");
  const reserved = await line.boundingBox();
  const initialViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 375, height: 812 });
  const mobileReserved = await line.boundingBox();
  await equalSeats();
  const mobileSeat = await line.locator("xpath=ancestor::section[1]").boundingBox();
  await capture("current-hand-preflop-mobile.png");
  await page.setViewportSize(initialViewport);
  const card = page.locator('[data-playing-card]:visible').first();
  const dimensions = await card.boundingBox();
  async function update(street: "flop" | "turn" | "river", category: "one-pair" | "three-of-a-kind" | "four-of-a-kind", board: string[]) {
    f.set({ ...f.get(), version: f.get().version + 1, poker: { ...f.get().poker, street, communityCards: board,
      players: f.get().poker.players.map(p => p.id === human.id ? { ...p, holeCards: ["Ah", "Kd"], currentHandCategory: category } : p) } });
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
  }
  await update("flop", "one-pair", ["As", "7h", "9c"]);
  await expect(line).toHaveText("Pair");
  await expect(line).toHaveAttribute("aria-label", "Current hand: Pair");
  const flop = await line.boundingBox();
  expect(flop?.height).toBe(reserved?.height);
  expect(flop?.y).toBe(reserved?.y);
  const status = line.locator("xpath=following-sibling::span[1]");
  await expect(status).toHaveText("Your turn");
  await expect(status).toHaveCSS("background-color", "rgb(240, 183, 77)");
  await expect(status).toHaveCSS("color", "rgb(25, 62, 55)");
  expect((await status.boundingBox())!.y).toBeGreaterThanOrEqual(flop!.y + flop!.height);
  await expect(status).toHaveCSS("position", "absolute");
  const seat = await line.locator("xpath=ancestor::section[1]").boundingBox();
  const badge = await status.boundingBox();
  // Absolute bottom anchors to the inner edge of the one-pixel seat border.
  expect(Math.abs(badge!.y + badge!.height / 2 - (seat!.y + seat!.height - 1))).toBeLessThanOrEqual(0.5);
  await expect(page.locator("[data-seat-status]:visible").filter({ hasText: "Call 100" })).toHaveCount(1);
  expect((await card.boundingBox())?.width).toBe(dimensions?.width);
  expect((await card.boundingBox())?.height).toBe(dimensions?.height);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await equalSeats();
  await capture("current-hand-desktop.png");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(line).toHaveText("Pair");
  const mobileFlop = await line.boundingBox();
  const mobileFlopSeat = await line.locator("xpath=ancestor::section[1]").boundingBox();
  expect(mobileFlop!.y - mobileFlopSeat!.y).toBe(mobileReserved!.y - mobileSeat!.y);
  expect((await line.boundingBox())?.height).toBe(mobileReserved?.height);
  await expect(status).toHaveText("Your turn");
  await equalSeats();
  await capture("current-hand-mobile.png");
  for (const action of ["bet", "raise"] as const) {
    callerAction = action;
    f.set({ ...f.get(), version: f.get().version + 1 });
    await page.reload();
    const badge = page.getByText(`${action.toUpperCase()} 100`, { exact: true }).filter({ visible: true });
    await expect(badge).toHaveCount(1);
    await expect(badge.locator("xpath=ancestor::section[1]").locator("[data-seat-status]")).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await equalSeats(); await capture(`single-${action}-desktop.png`);
    await page.setViewportSize({ width: 375, height: 812 });
    await equalSeats(); await capture(`single-${action}-mobile.png`);
  }
  callerAction = "call";
  await page.reload();
  await update("turn", "three-of-a-kind", ["As", "7h", "9c", "Ac"]);
  await expect(line).toHaveText("Three of a kind");
  await update("river", "four-of-a-kind", ["As", "7h", "9c", "Ac", "Ad"]);
  await expect(line).toHaveText("Four of a kind");
  await open(page);
  const toggle = page.getByRole("switch", { name: "Show current hand", exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: test.info().outputPath("current-hand-settings-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: test.info().outputPath("current-hand-settings-desktop.png") });
  await toggle.click(); await page.keyboard.press("Escape");
  await expect(line).toHaveCount(0);
  await equalSeats();
  await page.reload(); await expect(line).toHaveCount(0);
  await equalSeats();
  await open(page); await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click(); await page.keyboard.press("Escape");
  await expect(line).toHaveText("Four of a kind");
  // Long localized labels stay above the border badge at the narrowest supported size.
  await page.goto(`/nl-NL/game/${f.id}`);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(line).toHaveAttribute("aria-label", /Huidige hand/);
  const localized = await line.boundingBox();
  expect((await status.boundingBox())!.y).toBeGreaterThanOrEqual(localized!.y + localized!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await equalSeats();
  await capture("current-hand-dutch-mobile.png");
  const activeGame = f.get();
  f.set({ ...f.get(), status: "complete", poker: { ...f.get().poker, street: "complete", currentActorId: null,
    legalActions: [], completionReason: "showdown", winnerIds: [human.id], winnerAmounts: { [human.id]: 100 },
    viewerHandResult: { startStack: 10000, endStack: 10100, netChange: 100 },
    players: f.get().poker.players.map(p => p.id === human.id ? { ...p, currentHandCategory: null, bestHand: "four-of-a-kind",
      winningHand: { cards: ["Ah", "As", "Ac", "Ad", "Kd"], playsBoard: false } } : p) } });
  await page.goto(`/game/${f.id}`);
  await expect(line).toHaveCount(0);
  await equalSeats();
  await expect(page.locator("[data-winning-hand]")).toBeVisible();
  await expect(page.getByText("Four of a kind", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await capture("border-status-showdown-mobile.png");
  await page.route(`**/api/games/${f.id}/step`, () => {});
  f.set({ ...activeGame, version: activeGame.version + 1, poker: { ...activeGame.poker, currentActorId: caller.id } });
  await page.reload();
  const thinking = page.locator("[data-seat-status]:visible").filter({ hasText: "Thinking" });
  await expect(thinking).toHaveCount(1);
  await expect(thinking).toHaveCSS("background-color", "rgb(16, 75, 65)");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await equalSeats(); await capture("border-status-thinking-desktop.png");
  await page.setViewportSize({ width: 375, height: 812 });
  await equalSeats(); await capture("border-status-thinking-mobile.png");
});
