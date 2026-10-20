import { scanAccessibility } from "./accessibility";
import { completed } from "./replay-fixtures";
import { expect, test, type Page } from "./fixtures";
import { replayResponseSchema } from "../../lib/http/replay-contracts";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Review hand", exact: true });
async function refresh(page: Page) {
  const response = page.waitForResponse(r => /\/api\/games\/[^/]+$/.test(new URL(r.url()).pathname));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await response;
}

test("reviews persisted hands from Actions, with private cards, manual navigation and mobile history return", { tag: "@ui-regression" }, async ({ page, browser }) => {
  const f = await completed(browser,page);
  try {
    await scanAccessibility(page, "completed-results");
    const response = await page.request.get(`/api/games/${f.id}/hands/1/replay`);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const { replay } = replayResponseSchema.parse(await response.json());
    expect(JSON.stringify(replay)).not.toMatch(/playerToken|engineState|deck|stateBefore|initialState/);
    expect(replay.frames[0].players.filter(p => p.cards !== null)).toHaveLength(1);
    await page.getByRole("complementary", { name: "Actions" }).getByRole("button", { name: "Review", exact: true }).last().click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Back to Actions" })).toHaveCount(0);
    await expect(dialog(page).getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame","0");
    for (const key of ["Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      expect(await dialog(page).evaluate(node => node.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
    }
    await scanAccessibility(page, "replay-dialog");
    await page.setViewportSize({ width: 375, height: 812 });
    await scanAccessibility(page, "replay-dialog-mobile");
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(dialog(page).locator("[data-hand-announcement]")).toHaveCount(1);
    await expect(dialog(page).getByRole("img", { name: "Hidden card", exact: true })).toHaveCount(2);
    await expect(dialog(page).getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
    await expect(dialog(page).getByRole("button", { name: "Flop", exact: true })).toBeDisabled();
    const geometry = () => dialog(page).locator('[class*="table"]').evaluate(node => ({
      height: node.getBoundingClientRect().height,
      boardHeight: node.querySelector('[class*="board"]')!.getBoundingClientRect().height,
      seats: [...node.querySelectorAll("article")].map(seat => seat.getBoundingClientRect().height),
    }));
    const initialGeometry = await geometry();
    const bets = dialog(page).locator("[data-replay-bet]");
    await expect(bets).toHaveCount(replay.frames[0].players.filter(p => p.bet > 0).length);
    expect(await bets.evaluateAll(nodes => nodes.map(node => Number(node.getAttribute("data-replay-bet"))))).toEqual(replay.frames[0].players.filter(p => p.bet > 0).map(p => p.bet));
    for (const stack of await dialog(page).locator("[data-replay-stack]").all()) {
      await expect(stack).not.toContainText("Bet");
    }
    await expect(dialog(page).locator('[class*="board"] [data-playing-card]')).toHaveCount(5);
    await expect(dialog(page).getByTitle("Dealer", { exact: true })).toHaveCount(1);
    await expect(dialog(page).getByTitle("Big blind", { exact: true })).toHaveCount(1);
    await page.keyboard.press("ArrowRight");
    expect(await geometry()).toEqual(initialGeometry);
    await expect(dialog(page)).toContainText("1/1:");
    await expect(dialog(page).locator("[data-replay-announcement]")).toContainText("folds");
    await expect(dialog(page)).not.toContainText("Last actor:");
    await expect(dialog(page)).not.toContainText("Next to act:");
    await dialog(page).getByRole("button", { name: "Result", exact: true }).click();
    await expect(dialog(page)).not.toContainText("The live game continues during review.");
    await expect(dialog(page).locator("ol")).toHaveCount(0);
    await expect(bets).toHaveCount(0);
    expect(await geometry()).toEqual(initialGeometry);
    const seatAwards = new Map<number, number>();
    for (const pot of replay.pots) for (const award of pot.awards) seatAwards.set(award.seat, (seatAwards.get(award.seat) ?? 0) + award.amount);
    await expect(dialog(page).locator('[data-replay-winner="true"]')).toHaveCount([...seatAwards.values()].filter(amount => amount > 0).length);
    for (const [seat, amount] of seatAwards) {
      if (amount === 0) continue;
      const player = replay.participants.find(p => p.seat === seat)!;
      const pill = dialog(page).getByLabel(`${player.name} wins ${amount.toLocaleString("en-US")}`, { exact: true });
      await expect(pill).toHaveText(`+${amount.toLocaleString("en-US")}`);
      await expect(pill).toHaveAttribute("title", /Pot 1:/);
    }
    await expect(dialog(page).getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    // Disabling the focused boundary button must not strand keyboard navigation.
    await dialog(page).getByRole("button", { name: "Previous", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Next", exact: true }).click();
    await expect(dialog(page).getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    await page.keyboard.press("ArrowLeft");
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", String(replay.frames.length - 2));
    await dialog(page).getByRole("button", { name: "Previous", exact: true }).click();
    await expect(dialog(page).getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
    await page.keyboard.press("ArrowRight");
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "1");
    // Clicking noninteractive content or leaving focus on the dialog also works.
    await dialog(page).locator('[class*="board"]').click();
    await page.keyboard.press("ArrowLeft");
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "0");
    await dialog(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "1");
    await page.keyboard.press("Control+ArrowRight");
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "1");
    await page.keyboard.press("ArrowRight");
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", String(replay.frames.length - 1));
    const version = (await f.read()).version;
    await page.keyboard.press("s"); await page.keyboard.press("d");
    expect((await f.read()).version).toBe(version);
    await refresh(page);
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame",String(replay.frames.length-1));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("complementary", { name: "Actions" }).getByRole("button", { name: "Review", exact: true })).toBeFocused();
    // A long feed makes retention observable away from either scroll boundary.
    await page.route(`**/api/games/${f.id}/feed*`, async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.feed.events = Array.from({ length: 30 }, () => body.feed.events).flat();
      await route.fulfill({ json: body });
    });
    await page.reload();
    await page.setViewportSize({ width: 375, height: 812 });
    // Close desktop preference then open mobile Actions through the shared toggle.
    const toggle = page.getByRole("button", { name: /(Expand|Collapse) actions panel$/ });
    await toggle.click();
    const actions = page.getByRole("dialog", { name: "Actions", exact: true });
    await expect(actions).toBeVisible();
    await toggle.evaluate(button => {
      button.setAttribute("data-restored", "0");
      button.addEventListener("focus", () => button.setAttribute("data-restored", String(Number(button.getAttribute("data-restored")) + 1)));
    });
    const scroll = actions.locator('[class*="scroll"]');
    await scroll.evaluate(node => { node.scrollTop = 120; node.dispatchEvent(new Event("scroll", { bubbles: true })); });
    const reading = await scroll.evaluate(node => node.scrollTop);
    expect(reading).toBeGreaterThan(0);
    // Invoke the scrolled-away review control without changing the reading position.
    await actions.getByRole("button", { name: "Review", exact: true }).evaluate(button => { if (button instanceof HTMLButtonElement) button.click(); });
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame","0");
    await page.screenshot({ path: test.info().outputPath("replay-mobile.png") });
    await dialog(page).getByRole("button", { name: "Back to Actions" }).click();
    await expect(actions).toBeVisible();
    await expect(actions.getByRole("button", { name: "Close actions panel" })).toBeFocused();
    await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBe(reading);
    await expect(toggle).toHaveAttribute("data-restored", "0");
    await page.screenshot({ path: test.info().outputPath("replay-mobile-actions.png") });
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("data-restored", "1");
    await toggle.click();
    await actions.getByRole("button", { name: "Review", exact: true }).evaluate(button => { if (button instanceof HTMLButtonElement) button.click(); });
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(actions).toHaveCount(0);
    await expect(toggle).toBeFocused();
    // Replay's original external opener may disappear during live updates.
    await toggle.click();
    await actions.getByRole("button", { name: "Review", exact: true }).evaluate(button => { if (button instanceof HTMLButtonElement) button.click(); });
    await expect(dialog(page)).toBeVisible();
    await toggle.evaluate(button => { button.style.display = "none"; });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Help", exact: true })).toBeFocused();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  } finally { await f.guestContext.close(); }
});

test("replay loading and retry stay isolated while a live timed turn arrives; late responses cannot reopen review", { tag: "@ui-regression" }, async ({ page,browser }) => {
  const f = await completed(browser,page);
  try {
    const path = `**/api/games/${f.id}/hands/1/replay`;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let fail = true;
    await page.route(path,async route => { await held; await route.fulfill({ status: 500, json: { error: "Unavailable" } }).catch(() => {}); });
    await page.getByRole("complementary", { name: "Actions" }).getByRole("button", { name: "Review", exact: true }).last().click();
    await expect(dialog(page)).toContainText("Loading hand");
    release();
    await expect(dialog(page)).toContainText("Unable to load hand.");
    await page.unroute(path);
    await page.route(path,route => fail ? route.fulfill({ status: 500, json: { error: "Unavailable" } }) : route.continue());
    fail = false;
    await dialog(page).getByRole("button", { name: "Retry", exact: true }).click();
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame","0");
    await dialog(page).getByRole("button", { name: "Result", exact: true }).click();
    const selected = await dialog(page).locator("[data-replay-frame]").getAttribute("data-replay-frame");
    expect((await f.guest.request.post(`/api/games/${f.id}/next-hand`, { data: { expectedVersion: (await f.read()).version } })).ok()).toBe(true);
    let live = await f.read();
    if (live.poker.currentActorId !== f.ownerId) {
      const guestGame = await f.read(f.guest);
      const action = guestGame.poker.legalActions.find(a => a.type === "call" || a.type === "check")!;
      expect((await f.guest.request.post(`/api/games/${f.id}/action`, { data: { expectedVersion: live.version, action } })).ok()).toBe(true);
    }
    live = await f.read(); expect(live.poker.currentActorId).toBe(f.ownerId);
    await refresh(page);
    await expect(dialog(page).locator("[data-replay-turn-warning]")).toBeVisible();
    await expect(dialog(page).locator("[data-hand-announcement]")).toContainText("Your turn.");
    await expect(dialog(page).locator("[data-turn-countdown]")).toBeVisible();
    await expect(dialog(page).getByRole("timer")).toHaveAttribute("aria-live", "off");
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame",selected!);
    await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("button", { name: "Fold", exact: true })).toBeEnabled();
    await page.unroute(path);
    let releaseLate!: () => void;
    const late = new Promise<void>(resolve => { releaseLate = resolve; });
    await page.route(path, async route => { const response = await route.fetch(); await late; await route.fulfill({ response }).catch(() => {}); });
    await page.getByRole("complementary", { name: "Actions" }).getByRole("button", { name: "Review", exact: true }).click();
    await expect(dialog(page)).toContainText("Loading hand");
    await expect(dialog(page).getByRole("button", { name: "Back to Actions" })).toHaveCount(0);
    await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
    releaseLate();
    await expect(dialog(page)).toHaveCount(0);
    await page.unroute(path);
    await page.getByRole("complementary", { name: "Actions" }).getByRole("button", { name: "Review", exact: true }).click();
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame","0");
    await page.screenshot({ path: test.info().outputPath("replay-live-turn.png") });
    await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
    const secondFeed = page.waitForResponse(r => new URL(r.url()).pathname === `/api/games/${f.id}/feed` && r.status() === 200);
    const beforeFold = await f.read();
    expect(beforeFold.turnTimer?.deadline).toBe(live.turnTimer?.deadline);
    expect((await page.request.post(`/api/games/${f.id}/action`, { data: { expectedVersion: beforeFold.version, action: { type: "fold" } } })).ok()).toBe(true);
    await refresh(page);
    await secondFeed;
    const secondHand = page.getByRole("complementary", { name: "Actions" }).locator("section").filter({ hasText: "Hand #2" });
    await secondHand.getByRole("button", { name: "Review", exact: true }).click();
    await expect(dialog(page)).toContainText("Hand #2");
    await expect(dialog(page).locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame","0");
    await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
    const secondPath = `**/api/games/${f.id}/hands/2/replay`;
    await page.route(secondPath, route => route.fulfill({ status: 422, json: { code: "REPLAY_UNAVAILABLE", error: "Unavailable" } }));
    await page.getByRole("complementary", { name: "Actions" }).getByRole("button", { name: "Review", exact: true }).last().click();
    await expect(dialog(page)).toContainText("This hand cannot be reviewed.");
    await expect(dialog(page).getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
    await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
    await page.unroute(secondPath);
    let releaseNavigation!: () => void;
    const navigating = new Promise<void>(resolve => { releaseNavigation = resolve; });
    await page.route(secondPath, async route => { const response = await route.fetch(); await navigating; await route.fulfill({ response }).catch(() => {}); });
    await page.getByRole("complementary", { name: "Actions" }).getByRole("button", { name: "Review", exact: true }).last().click();
    await expect(dialog(page)).toContainText("Loading hand");
    await page.goto("/play");
    releaseNavigation();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Play", exact: true })).toBeVisible();
  } finally { await f.guestContext.close(); }
});
