import { expect, test } from "@playwright/test";

test("@smoke publishes, refreshes, reports unavailable, preserves a name, and joins", async ({ browser, page }) => {
  test.setTimeout(60_000);
  await page.goto("/en-US");
  await page.goto("/en-US/play");
  await page.getByRole("button", { name: "Create table" }).click();
  const hostGameId = new URL(page.url()).pathname.split("/").at(-1);
  expect(hostGameId).toBeTruthy();
  const tableTitle = `Public E2E ${hostGameId!.slice(0, 8)}`;
  await expect(page.getByText("Private (unlisted)", { exact: true })).toBeVisible();
  await page.getByLabel("Table title (optional)").fill(tableTitle);
  await page.getByRole("button", { name: "Make public" }).click();
  await expect(page.getByText("Public listing", { exact: true })).toBeVisible();
  const hostDirectory = await page.request.get("/api/games/public");
  expect(hostDirectory.ok()).toBe(true);
  expect((await hostDirectory.json() as { games: { gameId: string }[] }).games)
    .not.toContainEqual(expect.objectContaining({ gameId: hostGameId }));

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto("/en-US/play");
  await expect(guest.getByText(tableTitle, { exact: true })).toBeVisible();
  await guest.getByLabel("Your name (optional)").fill("Directory Guest");
  await guest.reload();
  await expect(guest.getByLabel("Your name (optional)")).toHaveValue("Directory Guest");
  const directoryCard = guest.getByRole("listitem").filter({ hasText: tableTitle });

  await page.getByRole("button", { name: "Make private" }).click();
  await expect(page.getByText("Private (unlisted)", { exact: true })).toBeVisible();
  await directoryCard.getByRole("button", { name: "Join" }).click();
  await expect(guest.getByText("That table is no longer available. The list has been refreshed.")).toBeVisible();

  await page.getByRole("button", { name: "Make public" }).click();
  await expect(page.getByText("Public listing", { exact: true })).toBeVisible();
  await guest.getByRole("button", { name: "Refresh all tables" }).click();
  await expect(guest.getByText(tableTitle, { exact: true })).toBeVisible();
  await guest.getByRole("listitem").filter({ hasText: tableTitle }).getByRole("button", { name: "Join" }).click();
  await expect(guest).toHaveURL(/\/en-US\/game\/[0-9a-f-]+$/);
  await expect(guest.getByText("Directory Guest", { exact: true })).toBeVisible();

  await guestContext.close();
});

test("serializes simultaneous directory joins and makes duplicates idempotent", async ({ browser, page }) => {
  await page.goto("/en-US");
  await page.goto("/en-US/play");
  await page.getByRole("button", { name: "Create table" }).click();
  await expect(page.getByText("Private (unlisted)", { exact: true })).toBeVisible();
  await page.getByLabel("Table title (optional)").fill("Concurrent Table");
  await page.getByRole("button", { name: "Make public" }).click();

  const first = await browser.newContext();
  const second = await browser.newContext();
  const [firstDirectory, secondDirectory] = await Promise.all([
    first.request.get("/api/games/public").then((response) => response.json()),
    second.request.get("/api/games/public").then((response) => response.json()),
  ]) as [{ games: { gameId: string; version: number; title: string | null }[] }, { games: { gameId: string; version: number; title: string | null }[] }];
  const entry = firstDirectory.games.find((game) => game.title === "Concurrent Table");
  const secondEntry = secondDirectory.games.find((game) => game.title === "Concurrent Table");
  expect(entry).toBeTruthy();
  expect(secondEntry?.version).toBe(entry?.version);

  const [firstJoin, secondJoin] = await Promise.all([
    first.request.post(`/api/games/${entry!.gameId}/join`, { data: { name: "First Guest", expectedVersion: entry!.version } }),
    second.request.post(`/api/games/${entry!.gameId}/join`, { data: { name: "Second Guest", expectedVersion: entry!.version } }),
  ]);
  expect([firstJoin.status(), secondJoin.status()].sort()).toEqual([200, 409]);
  const winner = firstJoin.status() === 200 ? first : second;
  const winnerName = firstJoin.status() === 200 ? "First Guest" : "Second Guest";
  const joined = await (firstJoin.status() === 200 ? firstJoin : secondJoin).json() as { seat: number };
  const duplicate = await winner.request.post(`/api/games/${entry!.gameId}/join`, {
    data: { name: winnerName, expectedVersion: entry!.version },
  });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json() as { seat: number }).seat).toBe(joined.seat);

  await first.close();
  await second.close();
});
