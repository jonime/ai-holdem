import { expect, test } from "./fixtures";

test("@smoke creation captures one attempt, recovers a committed lost response after reload, and allows intentional subsequent creation", async ({ page }) => {
  await page.goto("/play");
  await page.getByLabel("Your name (optional)").fill(" Ada Recovery ");
  const attempts: string[] = [];
  let committedId = "";
  await page.route("**/api/games", async route => {
    const body = route.request().postDataJSON(); attempts.push(body.creationAttemptId);
    const response = await route.fetch();
    committedId = (await response.json()).gameId;
    if (attempts.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Create table", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole("button", { name: "Retry creation" })).toBeVisible();
  expect(attempts).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Quick Play vs AI", exact: true })).toBeDisabled();
  const stored = await page.evaluate(() => sessionStorage.getItem("ai-holdem-creation-attempt-v1"));
  expect(stored).toContain("Ada Recovery");
  const owner = (await page.context().cookies()).find(cookie => cookie.name === "ai-holdem-player-id")!.value;
  expect(stored).not.toContain(owner);
  await page.reload();
  await expect(page.getByText("A creation attempt is pending. Retry to recover the same table.")).toBeVisible();
  expect(attempts).toHaveLength(1);
  await page.getByRole("button", { name: "Retry creation" }).click();
  await expect(page).toHaveURL(new RegExp(`/game/${committedId}$`));
  expect(attempts[1]).toBe(attempts[0]);
  expect(await page.evaluate(() => sessionStorage.getItem("ai-holdem-creation-attempt-v1"))).toBeNull();
  const game = (await (await page.request.get(`/api/games/${committedId}`)).json()).game;
  expect(game.poker.players[0].name).toBe("Ada Recovery");
  await page.goto("/play");
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await expect(page).toHaveURL(/\/game\/[0-9a-f-]+$/);
  expect(attempts[2]).not.toBe(attempts[0]);
});

test("@ui-regression landing creates a first-visit identity and retries an invalid success with the same attempt", async ({ page }) => {
  let calls = 0; const ids: string[] = [];
  await page.route("**/quick-game", async route => {
    ids.push(route.request().postDataJSON().creationAttemptId); calls++;
    await route.fulfill({ json: { gameId: calls === 1 ? "bad/id" : "11111111-1111-4111-8111-111111111111" } });
  });
  await page.goto("/");
  expect((await page.context().cookies()).find(cookie => cookie.name === "ai-holdem-player-id")).toBeUndefined();
  await page.getByRole("button", { name: "Quick Play vs AI" }).click();
  await expect(page.getByRole("button", { name: "Retry creation" })).toBeVisible();
  expect((await page.context().cookies()).find(cookie => cookie.name === "ai-holdem-player-id")?.value).toMatch(/^[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Retry creation" }).click();
  await expect(page).toHaveURL(/\/game\/11111111-1111-4111-8111-111111111111$/);
  expect(ids[0]).toBe(ids[1]);
});

test("@ui-regression changed identity prevents retries", async ({ page }) => {
  let calls = 0;
  await page.route("**/quick-game", route => { calls++; return route.abort("failed"); });
  await page.goto("/"); await page.getByRole("button", { name: "Quick Play vs AI" }).click();
  await expect(page.getByRole("button", { name: "Retry creation" })).toBeVisible();
  await page.context().addCookies([{ name: "ai-holdem-player-id", value: "changed-identity", url: page.url() }]);
  await page.getByRole("button", { name: "Retry creation" }).click();
  await expect(page.getByText("Your anonymous identity changed. This attempt cannot be safely resumed.")).toBeVisible();
  expect(calls).toBe(1);
});

test("@ui-regression unavailable storage retains in-memory retry and blocked cookies prevent submission", async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error("Unavailable"); }; });
  let calls = 0; const ids: string[] = [];
  await page.route("**/quick-game", route => { calls++; ids.push(route.request().postDataJSON().creationAttemptId); return route.abort("failed"); });
  await page.goto("/");
  await expect(page.getByText("Session storage is unavailable. Reloading loses this recovery attempt.")).toBeVisible();
  await page.getByRole("button", { name: "Quick Play vs AI" }).click();
  await expect(page.getByRole("button", { name: "Retry creation" })).toBeVisible();
  await page.getByRole("button", { name: "Retry creation" }).click();
  await expect.poll(() => calls).toBe(2); expect(ids[0]).toBe(ids[1]);
  await page.context().clearCookies();
  await page.addInitScript(() => { Object.defineProperty(document, "cookie", { get: () => "", set: () => {}, configurable: true }); });
  await page.reload();
  await page.getByRole("button", { name: "Quick Play vs AI" }).click();
  await expect(page.getByText("Cookies are required to create a table. Enable cookies and try again.")).toBeVisible();
  expect(calls).toBe(2);
  await expect(page.getByRole("button", { name: "Quick Play vs AI" })).toBeEnabled();
});

test("@ui-regression creation deadline cleans pending state and fences a late response", async ({ page }) => {
  await page.clock.install();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const attempts: string[] = [];
  await page.route("**/quick-game", async route => {
    attempts.push(route.request().postDataJSON().creationAttemptId);
    if (attempts.length === 1) {
      await held;
      await route.fulfill({ json: { gameId: "11111111-1111-4111-8111-111111111111" } }).catch(() => {});
    } else await route.abort("failed");
  });
  await page.goto("/"); await page.getByRole("button", { name: "Quick Play vs AI" }).click();
  await expect.poll(() => attempts.length).toBe(1);
  await page.clock.fastForward(15_001);
  await expect(page.getByRole("button", { name: "Retry creation" })).toBeEnabled();
  release();
  await expect(page.getByText("The result could not be confirmed. Retry creation to recover the same table.")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  await page.getByRole("button", { name: "Retry creation" }).click();
  await expect.poll(() => attempts.length).toBe(2); expect(attempts[0]).toBe(attempts[1]);
});

test("@smoke native creation remains usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage(); await page.goto("/");
    await page.getByRole("button", { name: "Quick Play vs AI" }).click();
    await expect(page).toHaveURL(/\/game\/[0-9a-f-]+$/);
    expect((await context.cookies()).find(cookie => cookie.name === "ai-holdem-player-id")).toBeDefined();
  } finally { await context.close(); }
});
