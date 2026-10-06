import { expect, test, type Page } from "@playwright/test";
import type { Game } from "../../components/poker/types";

function observeRealtime(page: Page) {
  let subscribed = false;
  const notifications: unknown[] = [];
  page.on("websocket", socket => {
    if (!socket.url().includes("/realtime/v1/websocket")) return;
    socket.on("framereceived", ({ payload }) => {
      try {
        const frame = JSON.parse(String(payload));
        const topic = Array.isArray(frame) ? frame[2] : frame.topic;
        const event = Array.isArray(frame) ? frame[3] : frame.event;
        const body = Array.isArray(frame) ? frame[4] : frame.payload;
        if (topic?.startsWith("realtime:game:") && event === "phx_reply" && body.status === "ok") subscribed = true;
        if (event === "broadcast") notifications.push(body.payload);
      } catch { /* Other frames do not represent game notifications. */ }
    });
  });
  return { notifications, subscribed: () => subscribed };
}

async function createTable(page: Page) {
  await page.goto("/en-US");
  await page.goto("/en-US/play");
  await page.getByRole("button", { name: "Create table" }).click();
  await expect(page.getByText("WAITING ROOM")).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

// Run these against a changed Vercel preview as well as the isolated local server.
test("actual Realtime delivers committed game and same-version seat changes before polling", { tag: "@smoke" }, async ({ page, browser }) => {
  test.setTimeout(45_000);
  const gameId = await createTable(page);
  const secondContext = await browser.newContext();
  try {
    const second = await secondContext.newPage();
    const received = observeRealtime(second);
    await second.goto(page.url());
    await expect(second.getByText("WAITING ROOM")).toBeVisible();
    await expect.poll(received.subscribed).toBe(true);
    // Freeze browser timers so polling cannot make the delivery assertions pass.
    await second.clock.install();
    await second.clock.pauseAt(new Date());
    const read = async () => {
      const response = await page.request.get(`/api/games/${gameId}`);
      expect(response.ok()).toBe(true);
      return (await response.json() as { game: Game }).game;
    };
    const before = await read();
    const changed = await page.request.patch(`/api/games/${gameId}/settings`, {
      data: { expectedVersion: before.version, seatCount: 4, smallBlind: 25, bigBlind: 50, startingStack: 5000, botsShowUncontestedWins: false },
    });
    expect(changed.ok()).toBe(true);
    const committed = (await changed.json() as { game: Game }).game;
    await expect.poll(() => received.notifications, { timeout: 4000 }).toContainEqual({ type: "table_settings_updated", gameId, version: committed.version });
    await second.clock.runFor(100);
    await expect(second.getByLabel("Table settings").getByText("5,000", { exact: true })).toBeVisible({ timeout: 4000 });

    const host = committed.poker.players.find(player => player.isHost)!;
    const renamed = await page.request.patch(`/api/games/${gameId}/seats/${host.seat}/name`, { data: { name: "Realtime Smoke" } });
    expect(renamed.ok()).toBe(true);
    expect((await read()).version).toBe(committed.version);
    await expect.poll(() => received.notifications, { timeout: 4000 }).toContainEqual({ type: "seat_name_updated", gameId });
    await second.clock.runFor(100);
    await expect(second.getByText("Realtime Smoke", { exact: true })).toBeVisible({ timeout: 4000 });
    await second.screenshot({ path: "test-results/realtime-two-browser.png", fullPage: true });
    // A separate browser is a spectator even though it observes notifications.
    expect((await second.request.post(`/api/games/${gameId}/step`, { data: { expectedVersion: committed.version } })).status()).toBe(403);
  } finally {
    await secondContext.close();
  }
});

test("blocked delivery recovers through fallback polling", { tag: "@smoke" }, async ({ page, browser }) => {
  test.setTimeout(30_000);
  const gameId = await createTable(page);
  const secondContext = await browser.newContext();
  try {
    await secondContext.routeWebSocket(/\/realtime\/v1\/websocket/, () => undefined);
    const second = await secondContext.newPage();
    await second.goto(page.url());
    await expect(second.getByText("WAITING ROOM")).toBeVisible();
    const { game } = await (await page.request.get(`/api/games/${gameId}`)).json() as { game: Game };
    expect((await page.request.patch(`/api/games/${gameId}/settings`, {
      data: { expectedVersion: game.version, seatCount: 4, smallBlind: 25, bigBlind: 50, startingStack: 5000, botsShowUncontestedWins: false },
    })).ok()).toBe(true);
    await expect(second.getByLabel("Table settings").getByText("5,000", { exact: true })).toBeVisible({ timeout: 12000 });
  } finally {
    await secondContext.close();
  }
});
