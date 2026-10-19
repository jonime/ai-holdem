import { expect, test } from "./fixtures";

test("@smoke Play navigation, empty state, custom creation, return and identity isolation", async ({ page, browser }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Quick Play vs AI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create custom table" })).toHaveCount(0);
  await page.getByRole("link", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("heading", { name: "Open public tables" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your tables" })).toBeVisible();
  const empty = await page.request.get("/api/games/mine?playerToken=other");
  expect(await empty.json()).toEqual({ games: [] }); expect(empty.headers()["cache-control"]).toContain("private, no-store");
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await expect(page).toHaveURL(/\/game\/[0-9a-f-]+$/);
  const gameUrl = page.url(); const gameId = new URL(gameUrl).pathname.split("/").at(-1);
  await page.goto("/play");
  const mine = page.getByRole("region", { name: "Your tables" });
  await expect(mine).not.toContainText("Recently active"); await expect(mine).toContainText("Waiting");
  const visitor = await browser.newContext();
  try {
    const visitorPage = await visitor.newPage(); await visitorPage.goto(gameUrl);
    expect(await (await visitor.request.get("/api/games/mine")).json()).toEqual({ games: [] });
    await visitorPage.goto("/play"); await expect(visitorPage.getByRole("heading", { name: "Your tables" })).toBeVisible();
    await visitorPage.getByRole("button", { name: "Create table", exact: true }).click();
    await expect(visitorPage).toHaveURL(/\/game\/[0-9a-f-]+$/);
    const visitorId = new URL(visitorPage.url()).pathname.split("/").at(-1);
    const first = await (await page.request.get("/api/games/mine")).json();
    const second = await (await visitor.request.get("/api/games/mine")).json();
    expect(first.games.map((game: { gameId: string }) => game.gameId)).toEqual([gameId]);
    expect(second.games.map((game: { gameId: string }) => game.gameId)).toEqual([visitorId]);
  } finally { await visitor.close(); }
  await mine.getByRole("link", { name: /^Return to table:/ }).press("Enter"); await expect(page).toHaveURL(gameUrl);
});

test("@smoke Play public refresh failures recover without refreshing personal tables", async ({ page }) => {
  await page.goto("/play?tab=public");
  let personalRequests = 0;
  page.on("request", request => { if (request.url().endsWith("/api/games/mine")) personalRequests++; });
  await expect(page.getByRole("button", { name: "Refresh all tables" })).toHaveCount(0);
  // Local runs preserve tables, so establish the empty-directory branch explicitly.
  await page.route("**/api/games/public*", route => route.fulfill({ json: { games: [], nextCursor: null } }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("No public tables are available right now.")).toBeVisible();
  await page.route("**/api/games/public*", route => route.fulfill({ status: 500, json: { error: "Failed" } }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Public tables could not be loaded.")).toBeVisible();
  await expect(page.getByText("No public tables are available right now.")).toHaveCount(0);
  await page.route("**/api/games/public*", route => route.fulfill({ json: { games: [], nextCursor: null } }));
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("No public tables are available right now.")).toBeVisible();
  expect(personalRequests).toBe(0);
});

test("@smoke Play directory pagination, join conflict, redirects, mobile and keyboard", async ({ page }, testInfo) => {
  await page.goto("/fi-FI/join-game"); await expect(page).toHaveURL(/\/fi-FI\/play$/);
  const old = await page.request.get("/join-game", { maxRedirects: 0 }); expect(old.status()).toBe(308); expect(old.headers().location).toBe("/play");
  const language = await page.request.get("/play", { maxRedirects: 0, headers: { "Accept-Language": "fi" } }); expect(language.status()).toBe(200); expect(language.headers().location).toBeUndefined();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/play?tab=public");
  const entry = { gameId: "11111111-1111-4111-8111-111111111111", title: "Pagination table", version: 1, occupiedSeats: 1, totalSeats: 6, humanCount: 1, botCount: 0, smallBlind: 10, bigBlind: 20, startingStack: 1000, publishedAt: "2026-10-06T12:00:00Z" };
  let calls = 0;
  await page.route("**/api/games/public*", route => route.fulfill({ json: ++calls === 1 ? { games: [], nextCursor: "next" } : { games: [entry], nextCursor: null } }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.getByRole("button", { name: "Join: Pagination table" })).toBeVisible();
  await page.route("**/api/games/*/join", route => route.fulfill({ status: 409, json: { error: "Conflict", code: "GAME_CONFLICT" } }));
  await page.getByRole("button", { name: "Join: Pagination table", exact: true }).press("Enter");
  await expect(page.getByText("That table changed. Review the refreshed list and try again.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const create = page.getByRole("button", { name: "Create table", exact: true });
  await page.getByLabel("Your name (optional)").focus(); await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Quick Play vs AI", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(create).toBeFocused();
  for (const name of ["Your tables", "Open public tables", "Shared hands"]) {
    await page.keyboard.press("Tab"); await expect(page.getByRole("navigation").getByRole("link", { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeFocused();
  await expect(page.locator("h1")).toHaveText("Play");
  await expect(page.getByText("Choose a public table with an active host.")).toHaveCount(0);
  const refresh = page.getByRole("button", { name: "Refresh", exact: true });
  const centered = await refresh.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const icon = button.querySelector("svg")!.getBoundingClientRect();
    return Math.abs(rect.x + rect.width / 2 - icon.x - icon.width / 2) < 1 &&
      Math.abs(rect.y + rect.height / 2 - icon.y - icon.height / 2) < 1;
  });
  expect(centered).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("play-mobile.png"), fullPage: true });
});

for (const locale of ["", "/fi-FI"]) {
  test(`@smoke Play submits visible names during both creations (${locale || "English"})`, async ({ page }, testInfo) => {
    let renames = 0;
    page.on("request", request => { if (/\/seats\/\d+\/name$/.test(request.url())) renames++; });
    await page.goto(`${locale}/play`);
    const input = page.locator('input[name="hostName"]');
    await input.fill("  Ada Quick  ");
    await input.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${locale}/game/[0-9a-f-]+$`));
    const quickId = new URL(page.url()).pathname.split("/").at(-1);
    const read = async () => (await (await page.request.get(`/api/games/${quickId}`)).json()).game;
    const quick = await read();
    expect(quick.poker.players.find((player: { controller: string }) => player.controller === "human").name).toBe("Ada Quick");
    expect(quick.poker.players.find((seat: { playerToken: string | null }) => seat.playerToken)?.name).toBe("Ada Quick");
    await expect.poll(async () => {
      const game = await read();
      return game.poker.currentActorId === game.poker.players.find((player: { controller: string }) => player.controller === "human").id;
    }, { timeout: 15_000 }).toBe(true);
    const turn = await read();
    const fold = await page.request.post(`/api/games/${quickId}/action`, { data: { expectedVersion: turn.version, action: { type: "fold" } } });
    expect(fold.ok()).toBe(true);
    const feed = await (await page.request.get(`/api/games/${quickId}/feed`)).json();
    expect(feed.feed.events).toContainEqual(expect.objectContaining({ type: "action", handNumber: 1, player: "Ada Quick", controller: "human", action: "fold" }));
    await page.goto(`${locale}/play`);
    await expect(input).toHaveValue("  Ada Quick  ");
    await input.fill("Ada Custom");
    await page.screenshot({ path: testInfo.outputPath("play-name.png"), fullPage: true });
    await page.locator('button[formaction]').click();
    await expect(page).toHaveURL(new RegExp(`${locale}/game/[0-9a-f-]+$`));
    const customId = new URL(page.url()).pathname.split("/").at(-1);
    const custom = (await (await page.request.get(`/api/games/${customId}`)).json()).game;
    expect(custom.poker.players.find((seat: { playerToken: string | null }) => seat.playerToken)?.name).toBe("Ada Custom");
    expect(renames).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("named-custom-table.png"), fullPage: true });
    await page.goto(`${locale || "/"}`);
    await page.locator('form[action$="/quick-game"] button').click();
    await expect(page).toHaveURL(new RegExp(`${locale}/game/[0-9a-f-]+$`));
    const landingId = new URL(page.url()).pathname.split("/").at(-1);
    const landing = (await (await page.request.get(`/api/games/${landingId}`)).json()).game;
    expect(landing.poker.players.find((player: { controller: string }) => player.controller === "human").name).toBe("Player 1");
    expect(renames).toBe(0);
  });
}

for (const failure of ["getItem", "setItem"] as const) {
  test(`@smoke Play typing and enhanced submission tolerate storage ${failure} failure`, async ({ page }) => {
    await page.addInitScript(method => {
      Storage.prototype[method] = () => { throw new Error("Storage unavailable"); };
    }, failure);
    await page.goto("/play");
    const input = page.locator('input[name="hostName"]');
    await input.fill("Storage Ada");
    await expect(input).toHaveValue("Storage Ada");
    await page.route("**/quick-game", async route => {
      expect(route.request().postDataJSON().hostName).toBe("Storage Ada");
      expect(route.request().postDataJSON().creationAttemptId).toMatch(/^[0-9a-f-]{36}$/);
      await route.fulfill({ json: { gameId: "11111111-1111-4111-8111-111111111111" } });
    });
    await input.press("Enter");
    await expect(page).toHaveURL(/\/game\/11111111-1111-4111-8111-111111111111$/);
  });
}

test("@smoke Play submits names without JavaScript", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: testInfo.project.use.baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/play");
    await page.locator('input[name="hostName"]').fill("Native Ada");
    await page.locator('button[formaction]').click();
    await expect(page).toHaveURL(/\/game\/[0-9a-f-]+$/);
    const gameId = new URL(page.url()).pathname.split("/").at(-1);
    const game = (await (await context.request.get(`/api/games/${gameId}`)).json()).game;
    expect(game.poker.players.find((seat: { playerToken: string | null }) => seat.playerToken)?.name).toBe("Native Ada");
  } finally { await context.close(); }
});

for (const locale of ["", "/fi-FI"]) {
  test(`@smoke Play recognizable assignment summaries and activity (${locale || "English"})`, async ({ page, browser }, testInfo) => {
    const errors: string[] = [];
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const create = async (path: string) => {
      const response = await page.request.post(path, { maxRedirects: 0 });
      expect(response.status()).toBe(303);
      return new URL(response.headers().location).pathname.split("/").at(-1)!;
    };
    const quick = await create(`${locale}/quick-game`);
    const custom = await create(`${locale}/new-game`);
    const titled = await create(`${locale}/new-game`);
    const read = async (id: string) => (await (await page.request.get(`/api/games/${id}`)).json()).game;
    const publish = await page.request.patch(`/api/games/${titled}/publication`, { data: { expectedVersion: (await read(titled)).version, isPublic: true, title: "Friday friends" } });
    expect(publish.ok()).toBe(true);
    const mineResponse = await page.request.get("/api/games/mine");
    expect(mineResponse.headers()["cache-control"]).toContain("private, no-store");
    const summaries = (await mineResponse.json()).games;
    expect(summaries.find((g: { gameId: string }) => g.gameId === quick)).toMatchObject({ humanCount: 1, botCount: 5, viewerSeated: true, occupiedSeats: 6 });
    const regionName = locale ? "Omat pöytäsi" : "Your tables";
    // Confirm the server-rendered UTC output with JavaScript disabled and the same identity.
    const nativeContext = await browser.newContext({ javaScriptEnabled: false, baseURL: testInfo.project.use.baseURL });
    try {
      await nativeContext.addCookies(await page.context().cookies());
      const native = await nativeContext.newPage(); await native.goto(`${locale}/play`);
      // PPR streams the personal section in a hidden segment before its reveal script runs.
      const time = native.locator('section[aria-labelledby="my-tables-heading"] time').first();
      await expect(time).toContainText("UTC");
      expect(await time.textContent()).toBe(await time.getAttribute("aria-label"));
    } finally { await nativeContext.close(); }
    await page.goto(`${locale}/play`);
    const mine = page.getByRole("region", { name: regionName });
    const row = (id: string) => mine.getByRole("listitem").filter({ has: page.locator(`a[href$="/game/${id}"]`) });
    await expect(row(quick)).toContainText(locale ? "Pöytä bottien kanssa" : "Table with bots");
    await expect(row(quick)).toContainText(locale ? "Sinä · 5 bottia" : "You · 5 bots");
    await expect(row(custom)).toContainText(locale ? "Pokeripöytä" : "Poker table");
    await expect(row(custom)).toContainText(custom.slice(0, 8));
    await expect(row(titled).getByRole("heading")).toHaveText("Friday friends");
    const time = row(custom).locator("time");
    await expect(time).toHaveText(locale ? "Päivitetty juuri nyt" : "Updated just now");
    expect(await time.getAttribute("title")).toContain("UTC");
    expect(await time.getAttribute("title")).toBe(await time.getAttribute("aria-label"));
    expect(errors.filter(message => /hydrat/i.test(message))).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`your-tables-${locale ? "fi" : "en"}-desktop.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`your-tables-${locale ? "fi" : "en"}-mobile.png`), fullPage: true });
    await row(custom).getByRole("link").click(); await expect(page).toHaveURL(new RegExp(`/game/${custom}$`));
    await page.goto(`${locale}/play`);
    await row(custom).getByRole("button").click();
    const confirmation = page.getByRole("dialog");
    await expect(confirmation).toContainText(custom.slice(0, 8));
    await confirmation.getByRole("button", { name: locale ? "Poista pöytä" : "Delete table", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(row(custom)).toHaveCount(0); await expect(row(quick)).toBeVisible();
  });
}
