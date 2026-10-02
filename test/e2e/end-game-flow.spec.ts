import { expect, test, type Page } from "@playwright/test";
import type { Game } from "../../components/poker/types";

// Public-state fixtures exercise rare settled outcomes without controlling the engine.
// Replay itself uses the real local Quick Play endpoint and persistence.
async function tableFixture(page: Page) {
  const response = await page.request.post("/en-US/quick-game", { headers: { Accept: "application/json" } });
  expect(response.status()).toBe(201);
  const { gameId } = await response.json();
  const original: Game = (await (await page.request.get(`/api/games/${gameId}`)).json()).game;
  let game: Game = {
    ...original,
    version: original.version + 100,
    poker: { ...original.poker, street: "complete", currentActorId: null,
      completionReason: "showdown", legalActions: [], pot: 0,
      winnerIds: [original.poker.players[1].id], winnerAmounts: { [original.poker.players[1].id]: 200 },
      players: original.poker.players.map((p, i) => ({ ...p, stack: i === 0 ? 0 : 12000,
        inHand: false, folded: false, allIn: false, bestHand: i === 1 ? "one-pair" : null })),
    },
  };
  await page.route(`**/api/games/${gameId}`, route => route.fulfill({ json: { game } }));
  await page.goto(`/en-US/game/${gameId}`);
  return { gameId, original, current: () => game, set: (next: Game) => { game = next; } };
}

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "New Quick Play", exact: true })).toBeVisible();
}

test("settled elimination persists, watches manually with expected version, and protects pending replay", async ({ page }) => {
  const fixture = await tableFixture(page);
  await expect(page.getByText("You’re out of chips", { exact: true })).toBeVisible();
  await expect(page.locator("[data-hand-result]")).toContainText("wins 200");
  await expect(page.getByRole("complementary", { name: "Actions", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fold", exact: true })).toHaveCount(0);
  await fits(page);
  await page.screenshot({ path: "test-results/elimination-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await fits(page);
  await page.screenshot({ path: "test-results/elimination-mobile.png", fullPage: true });
  await page.reload();
  await expect(page.getByText("You’re out of chips", { exact: true })).toBeVisible();
  let nextRequests = 0;
  await page.route(`**/api/games/${fixture.gameId}/next-hand`, async route => {
    nextRequests++;
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: fixture.current().version });
    const current = fixture.current();
    fixture.set({ ...current, version: current.version + 1, poker: { ...current.poker,
      street: "preflop", handNumber: 2, completionReason: null, winnerIds: [], winnerAmounts: {}, currentActorId: null } });
    await route.fulfill({ json: { game: fixture.current() } });
  });
  await page.getByRole("button", { name: "Watch next hand", exact: true }).click();
  await expect(page.getByText("You’re watching", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fold", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Watch next hand", exact: true })).toBeDisabled();
  expect(nextRequests).toBe(1);

  const watching = fixture.current();
  fixture.set({ ...watching, poker: { ...watching.poker, street: "complete", completionReason: "showdown",
    winnerIds: [watching.poker.players[1].id], winnerAmounts: { [watching.poker.players[1].id]: 200 } } });
  await page.reload();
  await expect(page.getByRole("button", { name: "Watch next hand", exact: true })).toBeEnabled();
  let requests = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/en-US/quick-game", async route => {
    requests++;
    await held;
    await route.fulfill({ status: 500, json: { error: "private-provider-detail" } });
  });
  // Enter on the focused replay button must activate replay, not the global next-hand shortcut.
  await page.getByRole("button", { name: "New Quick Play", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Starting…", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Watch next hand", exact: true })).toBeDisabled();
  await page.locator('[class*="actionControls"] button').first().evaluate(button => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await page.keyboard.press("s");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  expect(requests).toBe(1);
  expect(nextRequests).toBe(1);
  release();
  await expect(page.locator("main").getByRole("alert")).toContainText("Unable to start Quick Play. Please try again.");
  await expect(page.getByRole("button", { name: "New Quick Play", exact: true })).toBeEnabled();
  expect(page.url()).toContain(fixture.gameId);
  await expect(page.getByText("private-provider-detail")).toHaveCount(0);
  await page.unroute("**/en-US/quick-game");
  await page.getByRole("button", { name: "New Quick Play", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(fixture.gameId));
  await expect(page).toHaveURL(/\/en-US\/game\/[a-f0-9-]+$/);
  const newId = page.url().split("/").at(-1)!;
  const fresh: Game = (await (await page.request.get(`/api/games/${newId}`)).json()).game;
  expect(fresh.status).toBe("playing");
  expect(fresh.poker.seatCount).toBe(6);
  expect(fresh.poker.players.filter(p => p.controller === "bot")).toHaveLength(5);
  expect(fresh.poker.players.filter(p => p.controller === "bot").every(p => p.bot?.provider === "rules")).toBe(true);
  expect(fresh.publication?.isPublic ?? false).toBe(false);
  const cookies = await page.context().cookies();
  expect(cookies.find(c => c.name === "last-visited-game-id")?.value).toBe(newId);
  expect(fresh.poker.players[0].playerToken).toBe(fixture.original.poker.players[0].playerToken);
  const old: Game = (await (await page.request.get(`/api/games/${fixture.gameId}`)).json()).game;
  expect(old.version).toBe(fixture.original.version);
});

test("table winners and spectators retain results while all next-hand shortcuts are blocked", async ({ page }) => {
  const fixture = await tableFixture(page);
  let nextRequests = 0;
  await page.route(`**/api/games/${fixture.gameId}/next-hand`, route => {
    nextRequests++;
    return route.fulfill({ status: 500, json: { error: "must not advance" } });
  });
  const current = fixture.current();
  fixture.set({ ...current, poker: { ...current.poker,
    completionReason: "fold",
    winnerIds: [current.poker.players[0].id], winnerAmounts: { [current.poker.players[0].id]: 60000 },
    players: current.poker.players.map((p, i) => ({ ...p, stack: i === 0 ? 60000 : 0 })),
  } });
  await page.reload();
  await expect(page.getByText("You won the table", { exact: true })).toBeVisible();
  for (const key of ["s", "Enter", "Space"]) {
    await page.locator("main").click({ position: { x: 1, y: 1 } });
    await page.keyboard.press(key);
  }
  expect(nextRequests).toBe(0);
  await expect(page.getByRole("button", { name: "Next Hand", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Watch next hand", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-hand-result]")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await fits(page);
  await page.screenshot({ path: "test-results/table-winner-mobile.png", fullPage: true });
  await expect(page.getByRole("button", { name: "Show", exact: true })).toBeEnabled();
  let reveals = 0;
  await page.route(`**/api/games/${fixture.gameId}/reveal`, route => {
    reveals++;
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: fixture.current().version, handNumber: fixture.current().poker.handNumber });
    const before = fixture.current();
    fixture.set({ ...before, version: before.version + 1, poker: { ...before.poker,
      players: before.poker.players.map((p, i) => ({ ...p, cardsRevealed: i === 0 || p.cardsRevealed })),
    } });
    return route.fulfill({ json: { game: fixture.current() } });
  });
  await page.locator("main").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("d");
  await expect(page.getByRole("button", { name: "Show", exact: true })).toHaveCount(0);
  expect(reveals).toBe(1);
  expect(nextRequests).toBe(0);
  const winning = fixture.current();
  fixture.set({ ...winning, poker: { ...winning.poker,
    winnerIds: [winning.poker.players[1].id], winnerAmounts: { [winning.poker.players[1].id]: 60000 },
    players: winning.poker.players.map((p, i) => ({ ...p, stack: i === 1 ? 60000 : 0 })),
  } });
  await page.reload();
  await expect(page.getByText(`${winning.poker.players[1].name} won the table`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Watch next hand", exact: true })).toHaveCount(0);
  const otherWinner = fixture.current();
  fixture.set({ ...otherWinner, viewerIsHost: false, poker: { ...otherWinner.poker,
    players: otherWinner.poker.players.map(p => ({ ...p, playerToken: null, holeCards: null })),
  } });
  await page.reload();
  await expect(page.getByText(`${winning.poker.players[1].name} won the table`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Quick Play", exact: true })).toBeEnabled();
  await expect(page.locator("[data-hand-result]")).toBeVisible();
  expect(nextRequests).toBe(0);
});


test("unresolved all-ins can recover, and watching retains seat/host eligibility and conflicts", async ({ page }) => {
  const fixture = await tableFixture(page);
  const completed = fixture.current();
  fixture.set({ ...completed, poker: { ...completed.poker, street: "river", completionReason: null,
    winnerIds: [], winnerAmounts: {},
    players: completed.poker.players.map((p, i) => ({ ...p, inHand: true, allIn: i === 0 })),
  } });
  await page.reload();
  await expect(page.getByText("You’re out of chips", { exact: true })).toHaveCount(0);
  await expect(page.getByText("You’re watching", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New Quick Play", exact: true })).toHaveCount(0);
  fixture.set({ ...completed, viewerIsHost: false, poker: { ...completed.poker,
    players: completed.poker.players.map((p, i) => ({ ...p, stack: i === 0 ? 200 : p.stack })),
  } });
  await page.reload();
  await expect(page.getByRole("button", { name: "Next Hand", exact: true })).toBeEnabled();
  await expect(page.getByText("You’re out of chips", { exact: true })).toHaveCount(0);
  fixture.set({ ...completed, viewerIsHost: false });
  await page.reload();
  await expect(page.getByRole("button", { name: "Watch next hand", exact: true })).toBeEnabled();
  let calls = 0;
  await page.route(`**/api/games/${fixture.gameId}/next-hand`, route => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: completed.version });
    return route.fulfill({ status: 409, json: { error: "Game version conflict" } });
  });
  await page.locator("main").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("s");
  await expect(page.locator("main").getByRole("alert")).toContainText("Game version conflict");
  await expect(page.getByText("You’re out of chips", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  fixture.set({ ...completed, viewerIsHost: false, poker: { ...completed.poker,
    players: completed.poker.players.map(p => ({ ...p, playerToken: null, holeCards: null })),
  } });
  await page.reload();
  await expect(page.getByRole("button", { name: "Watch next hand", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next Hand", exact: true })).toHaveCount(0);
  for (const key of ["s", "Enter", "Space"]) await page.keyboard.press(key);
  expect(calls).toBe(1);
});
