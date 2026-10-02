import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { Game } from "../../components/poker/types";

async function fixture(page: Page) {
  const response = await page.request.post("/en-US/quick-game", { headers: { Accept: "application/json" } });
  expect(response.status()).toBe(201);
  const { gameId } = await response.json();
  const original: Game = (await (await page.request.get(`/api/games/${gameId}`)).json()).game;
  const bot = original.poker.players.find(p => p.controller === "bot")!;
  let game: Game = { ...original, version: original.version + 100,
    poker: { ...original.poker, currentActorId: bot.id, street: "flop" } };
  await page.route(`**/api/games/${gameId}`, route => route.fulfill({ json: { game } }));
  return { gameId, current: () => game, set: (next: Game) => { game = next; } };
}

async function open(page: Page, gameId: string) {
  await page.goto(`/en-US/game/${gameId}`);
  await expect(page.getByRole("button", { name: "History", exact: true })).toBeVisible();
}

async function triggerRefresh(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

function humanTurn(game: Game): Game {
  return { ...game, version: game.version + 1, poker: { ...game.poker,
    currentActorId: game.poker.players.find(p => p.controller === "human")!.id } };
}

async function shareIdentity(source: BrowserContext, target: BrowserContext) {
  await target.addCookies(await source.cookies());
}

test("separate spectator identity stays passive on load, polling, refresh, and completion; API forbids steps", async ({ page, browser }) => {
  const f = await fixture(page);
  const spectatorContext = await browser.newContext();
  const spectator = await spectatorContext.newPage();
  let steps = 0;
  let reads = 0;
  let sendUpdate: (() => void) | undefined;
  await spectator.clock.install();
  await spectator.routeWebSocket(/\/realtime\/v1\/websocket/, socket => {
    socket.onMessage(message => {
      if (typeof message !== "string") return;
      const [joinRef, ref, topic, event] = JSON.parse(message);
      if (event === "phx_join" || event === "heartbeat") {
        socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: [] } }]));
      }
      if (event === "phx_join") {
        sendUpdate = () => socket.send(JSON.stringify([joinRef, null, topic, "broadcast", {
          type: "broadcast", event: "game_updated", payload: {
            type: "game_updated", gameId: f.gameId, version: f.current().version,
            game: { ...masked(), publication: null, poker: { ...masked().poker, legalActions: [] } },
          },
        }]));
      }
    });
  });
  spectator.on("request", request => { if (request.url().endsWith("/step")) steps++; });
  const masked = () => ({ ...f.current(), viewerIsHost: false, poker: { ...f.current().poker,
    players: f.current().poker.players.map(p => ({ ...p, playerToken: null, holeCards: null })) } });
  await spectator.route(`**/api/games/${f.gameId}`, route => {
    reads++;
    return route.fulfill({ json: { game: masked() } });
  });
  await open(spectator, f.gameId);
  await expect.poll(() => Boolean(sendUpdate)).toBe(true);
  const beforeBroadcast = reads;
  f.set({ ...f.current(), version: f.current().version + 1 });
  sendUpdate!();
  await spectator.clock.fastForward(250);
  await expect.poll(() => reads).toBeGreaterThan(beforeBroadcast);
  const beforePolling = reads;
  await spectator.clock.fastForward(31_000);
  await expect.poll(() => reads).toBeGreaterThan(beforePolling);
  expect(steps).toBe(0);
  f.set({ ...f.current(), version: f.current().version + 1, status: "complete",
    poker: { ...f.current().poker, street: "complete", currentActorId: null } });
  await triggerRefresh(spectator);
  await expect(spectator.getByRole("button", { name: "Retry bot", exact: true })).toHaveCount(0);
  expect(steps).toBe(0);
  const response = await spectator.request.post(`/api/games/${f.gameId}/step`, { data: { expectedVersion: 0 } });
  expect(response.status()).toBe(403);
  await spectatorContext.addCookies([{ name: "ai-holdem-player-id", value: "spectator-test", url: new URL(spectator.url()).origin }]);
  expect((await spectator.request.post(`/api/games/${f.gameId}/step`, { data: { expectedVersion: 0 } })).status()).toBe(403);
  await spectatorContext.close();
});

test("two authorized browsers race, loser refreshes silently and continues", async ({ page, browser }) => {
  const f = await fixture(page);
  const otherContext = await browser.newContext();
  await shareIdentity(page.context(), otherContext);
  const other = await otherContext.newPage();
  await other.route(`**/api/games/${f.gameId}`, route => route.fulfill({ json: { game: f.current() } }));
  let arrivals = 0;
  let commits = 0;
  let release!: () => void;
  const both = new Promise<void>(resolve => { release = resolve; });
  const handle = async (route: import("@playwright/test").Route) => {
    const expected = route.request().postDataJSON().expectedVersion;
    arrivals++;
    if (arrivals === 2) release();
    await both;
    if (expected !== f.current().version) {
      await route.fulfill({ status: 409, json: { error: "Game version conflict" } });
    } else {
      commits++;
      f.set(humanTurn(f.current()));
      await route.fulfill({ json: { game: f.current(), aiDecision: {} } });
    }
  };
  await page.route(`**/api/games/${f.gameId}/step`, handle);
  await other.route(`**/api/games/${f.gameId}/step`, handle);
  await Promise.all([open(page, f.gameId), open(other, f.gameId)]);
  await expect.poll(() => arrivals).toBe(2);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect(other.locator("main").getByRole("alert")).toHaveCount(0);
  expect(commits).toBe(1);
  f.set({ ...f.current(), version: f.current().version + 1,
    poker: { ...f.current().poker, currentActorId: f.current().poker.players.find(p => p.controller === "bot")!.id } });
  await triggerRefresh(other);
  await expect.poll(() => commits).toBe(2);
  await otherContext.close();
});

test("provider failures allow retry, conflict refresh failures are visible, completion stays manual", async ({ page }) => {
  const f = await fixture(page);
  let steps = 0;
  let nextHands = 0;
  page.on("request", r => { if (r.url().endsWith("/next-hand")) nextHands++; });
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    if (steps === 1) await route.fulfill({ status: 502, json: { error: "AI decision failed" } });
    else if (steps === 2) {
      await page.route(`**/api/games/${f.gameId}`, r => r.fulfill({ status: 500, json: { error: "Refresh failed" } }));
      await route.fulfill({ status: 409, json: { error: "Game version conflict" } });
    } else {
      f.set({ ...f.current(), version: f.current().version + 1, status: "complete",
        poker: { ...f.current().poker, street: "complete", currentActorId: null } });
      await route.fulfill({ json: { game: f.current(), aiDecision: {} } });
    }
  });
  await open(page, f.gameId);
  await expect(page.locator("main").getByRole("alert")).toContainText("AI decision failed");
  await page.getByRole("button", { name: /Retry/ }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Refresh failed");
  await page.getByRole("button", { name: /Retry/ }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(steps).toBe(3);
  expect(nextHands).toBe(0);
});

test("navigation discards a pending bot response and stops the old loop", async ({ page }) => {
  const f = await fixture(page);
  let steps = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    await held;
    await route.fulfill({ json: { game: { ...f.current(), version: f.current().version + 1 }, aiDecision: {} } }).catch(() => undefined);
  });
  await open(page, f.gameId);
  await expect.poll(() => steps).toBe(1);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Exit", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(f.gameId));
  release();
  await page.waitForTimeout(300);
  expect(steps).toBe(1);
});


test("advancement following a human action uses silent conflict recovery", async ({ page }) => {
  const f = await fixture(page);
  f.set({ ...humanTurn(f.current()), poker: { ...humanTurn(f.current()).poker, legalActions: [{ type: "check" }] } });
  let steps = 0;
  await page.route(`**/api/games/${f.gameId}/action`, async route => {
    f.set({ ...f.current(), version: f.current().version + 1, poker: { ...f.current().poker,
      currentActorId: f.current().poker.players.find(p => p.controller === "bot")!.id } });
    await route.fulfill({ json: { game: f.current() } });
  });
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    f.set(humanTurn(f.current()));
    await route.fulfill({ status: 409, json: { error: "Game version conflict" } });
  });
  await open(page, f.gameId);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect.poll(() => steps).toBe(1);
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeEnabled();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("loss of eligibility discards a pending response and stops subsequent steps", async ({ page }) => {
  const f = await fixture(page);
  let steps = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    const stale = f.current();
    await held;
    await route.fulfill({ json: { game: { ...stale, version: stale.version + 1 }, aiDecision: {} } });
  });
  await open(page, f.gameId);
  await expect.poll(() => steps).toBe(1);
  f.set({ ...f.current(), viewerIsHost: false, version: f.current().version + 1,
    poker: { ...f.current().poker, players: f.current().poker.players.map(p => ({ ...p, playerToken: null, holeCards: null })) } });
  const refreshed = page.waitForResponse(r => r.url().endsWith(`/api/games/${f.gameId}`));
  await triggerRefresh(page);
  await refreshed;
  release();
  await page.waitForTimeout(300);
  expect(steps).toBe(1);
  await expect(page.getByRole("button", { name: "Retry bot", exact: true })).toHaveCount(0);
});
