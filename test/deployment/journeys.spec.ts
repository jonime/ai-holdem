import { test, expect, read } from "./fixtures";
import { observeRealtime } from "../e2e/realtime-observer";

// Deliberately separate from local fixtures: no database access or rate-limit bypass.
test("private table ownership and spectator rejection", async ({ page, table }) => {
  await page.goto(`/game/${table.id}`);
  await expect(page.getByText("WAITING ROOM")).toBeVisible();
  const context = await table.guest();
  const guest = await context.newPage();
  await guest.goto(page.url());
  const before = await read(guest.request, table.id);
  expect(before.viewerIsHost).toBe(false);
  expect(before.publication).toBeNull();
  expect(before.poker.players.every(player => player.playerToken === null)).toBe(true);
  expect((await guest.request.post(`/api/games/${table.id}/step`, { data: { expectedVersion: before.version } })).status()).toBe(403);
  expect((await guest.request.post(`/api/games/${table.id}/seats/0/release`, { data: { expectedVersion: before.version } })).status()).toBe(403);
  await guest.getByRole("button", { name: "Sit here" }).first().click();
  await expect(guest.getByRole("button", { name: "Stand up" })).toBeVisible();
  const owned = await read(guest.request, table.id);
  expect(owned.poker.players.find(player => player.seat === 1)?.playerToken).toBeTruthy();
  expect(owned.poker.players.find(player => player.seat === 0)?.playerToken === null).toBe(true);
  const host = await read(page.request, table.id);
  expect(host.viewerIsHost).toBe(true);
  expect(host.poker.players.find(player => player.seat === 1)?.playerToken === null).toBe(true);
});

test("explicit Equity Rules completes a hand with results, Actions, and next hand", async ({ page, table }) => {
  await page.goto(`/game/${table.id}`);
  await page.getByLabel("Bot for seat 2").selectOption("equity-rules-v2");
  await page.getByRole("button", { name: "Assign bot" }).first().click();
  await expect(page.getByRole("article").getByText("Equity Rules #1", { exact: true })).toBeVisible();
  expect((await read(page.request, table.id)).poker.players.find(player => player.controller === "bot")?.bot?.id).toBe("equity-rules-v2");
  await page.getByRole("button", { name: "Start hand", exact: true }).click();
  const action = page.getByRole("button", { name: /^(Call|Check)/ });
  await expect(action).toBeEnabled();
  await action.click();
  await expect(page.getByRole("button", { name: "Fold", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Fold", exact: true }).click();
  const confirmation = page.getByRole("button", { name: "Fold anyway", exact: true });
  if (await confirmation.count()) await confirmation.click();
  await expect(page.getByText("Complete", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-hand-result]")).toBeVisible();
  const completed = await read(page.request, table.id);
  expect(completed.poker.winnerIds.length).toBeGreaterThan(0);
  await expect(page.getByRole("complementary", { name: "Actions", exact: true }).getByRole("listitem").filter({ hasText: "Equity Rules" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Next Hand", exact: true }).click();
  await expect(page.getByText("Hand 2", { exact: true })).toBeVisible();
});

test("real Realtime wakes two browsers and blocked sockets recover by polling", async ({ page, table }) => {
  await page.goto(`/game/${table.id}`);
  const observer = await (await table.guest()).newPage();
  const received = observeRealtime(observer);
  await observer.goto(page.url());
  await expect(observer.getByText("WAITING ROOM")).toBeVisible();
  await expect.poll(received.subscribed, { timeout: 15_000 }).toBe(true);
  await observer.clock.install();
  await observer.clock.pauseAt(new Date(Date.now() + 1000));
  const update = async (startingStack: number) => {
    const before = await read(page.request, table.id);
    const changed = await page.request.patch(`/api/games/${table.id}/settings`, { data: {
      expectedVersion: before.version, seatCount: 2, smallBlind: 25, bigBlind: 50, startingStack, botsShowUncontestedWins: false,
    } });
    expect(changed.ok()).toBe(true);
    return (await changed.json()).game;
  };
  const committed = await update(5000);
  await expect.poll(() => received.notifications, { timeout: 8000 }).toContainEqual({ type: "table_settings_updated", gameId: table.id, version: committed.version });
  await observer.clock.runFor(100);
  await expect(observer.getByLabel("Table settings").getByText("5,000", { exact: true })).toBeVisible();
  const host = committed.poker.players.find((player: { isHost: boolean }) => player.isHost);
  expect((await page.request.patch(`/api/games/${table.id}/seats/${host.seat}/name`, { data: { name: "Release Realtime" } })).ok()).toBe(true);
  expect((await read(page.request, table.id)).version).toBe(committed.version);
  await expect.poll(() => received.notifications, { timeout: 8000 }).toContainEqual({ type: "seat_name_updated", gameId: table.id });
  await observer.clock.runFor(100);
  await expect(observer.getByRole("article").getByText("Release Realtime", { exact: true })).toBeVisible();

  const blocked = await table.guest();
  await blocked.routeWebSocket(/\/realtime\/v1\/websocket/, () => undefined);
  const polling = await blocked.newPage();
  await polling.goto(page.url());
  await expect(polling.getByLabel("Table settings").getByText("5,000", { exact: true })).toBeVisible();
  await update(10000);
  await expect(polling.getByLabel("Table settings").getByText("10,000", { exact: true })).toBeVisible({ timeout: 15_000 });
});
