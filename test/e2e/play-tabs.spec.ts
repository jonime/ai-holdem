import { expect, test } from "./fixtures";
import { completed } from "./replay-fixtures";

test("Play URL tabs, selected-only loading, no prefetch, history and mobile keyboard", { tag: "@ui-regression" }, async ({ page }, testInfo) => {
  const requests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/play" && (request.headers()["next-router-prefetch"] || new URL(request.url()).searchParams.has("_rsc"))) requests.push(request.url()); });
  await page.goto("/play");
  const nav = page.getByRole("navigation", { name: "Play collections" });
  const personal = nav.getByRole("link", { name: "Your tables", exact: true });
  const publicTab = nav.getByRole("link", { name: "Open public tables", exact: true });
  const shared = nav.getByRole("link", { name: "Shared hands", exact: true });
  await expect(personal).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/No tables yet/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open public tables" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Shared hands" })).toHaveCount(0);
  await publicTab.hover(); await shared.hover();
  // Let an ordinary browser rendering cycle finish after hover/viewport observers.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(requests).toEqual([]);
  await publicTab.press("Enter"); await expect(page).toHaveURL(/\/play\?tab=public$/);
  await expect(publicTab).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Your tables" })).toHaveCount(0);
  await shared.click(); await expect(page).toHaveURL(/\/play\?tab=shared$/);
  await expect(page.getByText(/No active shared hands/)).toBeVisible();
  await expect(page.getByText(/anonymous cookie/)).toBeVisible();
  await page.goBack(); await expect(publicTab).toHaveAttribute("aria-current", "page");
  await page.goForward(); await expect(shared).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 320, height: 740 });
  for (const link of [personal, publicTab, shared]) await expect(link).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shared.focus(); await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Refresh list", exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("play-tabs-mobile.png"), fullPage: true });
  for (const query of ["tab=invalid", "tab=public&tab=public", "tab=shared&tab=public"]) {
    await page.goto(`/play?${query}`); await expect(personal).toHaveAttribute("aria-current", "page");
  }
});

test("Play Settings restores focus and preserves tab, language and future-game preferences", { tag: "@ui-regression" }, async ({ page }) => {
  await page.goto("/play?tab=shared");
  const opener = page.getByRole("button", { name: "Settings", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog.getByText(/game continues/)).toHaveCount(0);
  await dialog.getByRole("switch", { name: "Turn sound" }).click();
  await dialog.getByRole("switch", { name: "Show current hand" }).click();
  await dialog.getByRole("switch", { name: "Gameplay shortcuts" }).click();
  await dialog.getByRole("combobox", { name: "Card colours", exact: true }).selectOption("four-colour");
  await page.keyboard.press("Escape"); await expect(opener).toBeFocused();
  await opener.click(); await dialog.getByRole("combobox", { name: "Language", exact: true }).selectOption("fi-FI");
  await expect(page).toHaveURL(/\/fi-FI\/play\?tab=shared$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("link", { name: "Jaetut kädet" })).toHaveAttribute("aria-current", "page");
  await page.goto("/play?tab=public"); await opener.click();
  await expect(dialog.getByRole("switch", { name: "Turn sound" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByRole("switch", { name: "Show current hand" })).toHaveAttribute("aria-checked", "false");
  await expect(dialog.getByRole("switch", { name: "Gameplay shortcuts" })).toHaveAttribute("aria-checked", "false");
  await expect(dialog.getByRole("combobox", { name: "Card colours", exact: true })).toHaveValue("four-colour");
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/fi-FI\/play\?tab=shared$/);
});

test("Shared hands lists owned links, copy fallback, exact revoke and focus restoration", { tag: "@ui-regression" }, async ({ page, browser }, testInfo) => {
  const fixture = await completed(browser, page);
  try {
    const origin = new URL(page.url()).origin;
    const response = await page.request.post(`/api/games/${fixture.id}/hands/1/share`, { headers: { origin } });
    expect(response.ok()).toBe(true);
    const { share } = await response.json();
    const listed = await page.request.get("/api/replays/owned");
    expect(listed.headers()["cache-control"]).toBe("private, no-store");
    const body = await listed.text();
    expect(body).not.toContain(fixture.id); expect(body).not.toMatch(/snapshot|creator_token|playerToken/);
    const html = await page.request.get("/play?tab=shared");
    expect(await html.text()).not.toContain(fixture.id);
    await page.goto("/play?tab=shared");
    const row = page.getByRole("listitem").filter({ hasText: share.token.slice(0, 8) });
    await expect(row).toContainText("Hand 1");
    const view = row.getByRole("link", { name: /View: Hand 1/ });
    await expect(view).toHaveAttribute("rel", "noopener noreferrer");
    await expect(view).toHaveAttribute("referrerpolicy", "no-referrer");
    const popupPromise = page.waitForEvent("popup");
    await view.click();
    const viewer = await popupPromise;
    await expect(viewer.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "0");
    expect(await viewer.evaluate(() => document.referrer)).toBe("");
    await viewer.close();
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } }));
    await row.getByRole("button", { name: "Copy link" }).click();
    const fallback = row.getByRole("textbox", { name: "Share URL" });
    await expect(fallback).toHaveValue(new RegExp(`/replay/${share.token}$`));
    await fallback.focus();
    expect(await fallback.evaluate((input: HTMLInputElement) => input.selectionEnd === input.value.length && input.selectionStart === 0)).toBe(true);
    const revoke = row.getByRole("button", { name: "Revoke link", exact: true });
    await revoke.click(); await page.keyboard.press("Escape"); await expect(revoke).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await revoke.click();
    let mutations = 0;
    await page.route(`**/api/replays/owned/${share.token}`, async route => { mutations++; await route.continue(); });
    const confirm = page.getByRole("button", { name: "Confirm revocation", exact: true });
    await confirm.dblclick();
    await expect(page.getByRole("dialog")).toHaveCount(0); await expect(row).toHaveCount(0);
    expect(mutations).toBe(1);
    await expect(page.getByRole("heading", { name: "Shared hands", exact: true })).toBeFocused();
    expect((await page.request.get(`/api/replays/${share.token}`)).status()).toBe(404);
    await page.screenshot({ path: testInfo.outputPath("shared-hands-empty.png"), fullPage: true });
  } finally { await fixture.guestContext.close(); }
});

for (const recoveryFails of [false, true]) {
  test(`Shared revocation lost response reconciles once, refresh failure=${recoveryFails}`, { tag: "@ui-regression" }, async ({ page, browser }) => {
    const fixture = await completed(browser, page);
    try {
      const { share } = await (await page.request.post(`/api/games/${fixture.id}/hands/1/share`, { headers: { origin: new URL(page.url()).origin } })).json();
      await page.goto("/play?tab=shared");
      let mutations = 0, reads = 0, fail = recoveryFails;
      await page.route(`**/api/replays/owned/${share.token}`, async route => { mutations++; await route.fetch(); await route.abort("failed"); });
      await page.route("**/api/replays/owned", async route => { reads++; if (fail) await route.abort("failed"); else await route.continue(); });
      const row = page.getByRole("listitem").filter({ hasText: share.token.slice(0, 8) });
      await row.getByRole("button", { name: "Revoke link", exact: true }).click();
      await page.getByRole("button", { name: "Confirm revocation", exact: true }).click();
      if (recoveryFails) {
        await expect(page.getByRole("dialog")).toContainText("Refresh the list before managing more links.");
        await expect(page.getByRole("button", { name: "Confirm revocation", exact: true })).toBeDisabled();
        expect(reads).toBe(1); fail = false;
        await page.getByRole("dialog").getByRole("button", { name: "Refresh list", exact: true }).click();
      } else await expect(page.getByText(/outcome is uncertain/)).toBeVisible();
      await expect(row).toHaveCount(0); expect(mutations).toBe(1);
    } finally { await fixture.guestContext.close(); }
  });
}

test("Shared list paginates, filters expiry and keeps errors and late responses inside its tab", { tag: "@ui-regression" }, async ({ page }) => {
  await page.goto("/play?tab=shared");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  const shares = Array.from({ length: 20 }, (_, i) => ({ token: (i + 1).toString(16).padStart(64, "0"), handNumber: 30 - i, createdAt, expiresAt }));
  const cursor = { beforeCreatedAt: createdAt, beforeToken: shares.at(-1)!.token };
  let reads = 0, fail = false;
  await page.route("**/api/replays/owned*", async route => {
    reads++;
    if (fail) { await route.fulfill({ status: 500, json: { error: "Unavailable" } }); return; }
    const more = new URL(route.request().url()).searchParams.has("beforeToken");
    await route.fulfill({ json: more ? { shares: [{ ...shares[0], token: "f".repeat(64), handNumber: 1 }], nextCursor: null } : { shares, nextCursor: cursor } });
  });
  await page.getByRole("button", { name: "Refresh list", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(20);
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(21);
  expect(reads).toBe(2);
  fail = true;
  await page.getByRole("button", { name: "Refresh list", exact: true }).click();
  await expect(page.getByRole("region", { name: "Shared hands", exact: true }).getByRole("alert")).toHaveText("Shared hands could not be loaded.");
  await page.getByRole("navigation").getByRole("link", { name: "Your tables", exact: true }).click();
  await expect(page.getByText("Shared hands could not be loaded.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Shared hands" })).toHaveCount(0);
  await page.goto("/play?tab=shared");
  fail = false;
  await page.clock.install();
  await page.clock.setFixedTime(new Date(Date.now() + 7_200_000));
  await page.getByRole("button", { name: "Refresh list", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(0);
  await expect(page.getByText(/No active shared hands/)).toBeVisible();
  // An in-flight collection read is aborted on tab navigation.
  let requested!: () => void;
  const started = new Promise<void>(resolve => { requested = resolve; });
  await page.unroute("**/api/replays/owned*");
  let release!: () => void;
  const deferred = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/replays/owned", async route => { requested(); await deferred; await route.fulfill({ json: { shares, nextCursor: null } }).catch(() => {}); });
  await page.getByRole("button", { name: "Refresh list", exact: true }).click();
  await started;
  await page.getByRole("navigation").getByRole("link", { name: "Open public tables", exact: true }).click();
  release();
  await expect(page.getByRole("heading", { name: "Open public tables" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared hands" })).toHaveCount(0);
});

test("Acknowledged share revocation remains successful when list refill fails", { tag: "@ui-regression" }, async ({ page, browser }) => {
  const fixture = await completed(browser, page);
  try {
    const { share } = await (await page.request.post(`/api/games/${fixture.id}/hands/1/share`, { headers: { origin: new URL(page.url()).origin } })).json();
    await page.goto("/play?tab=shared");
    await page.route("**/api/replays/owned", route => route.fulfill({ status: 500, json: { error: "Unavailable" } }));
    const row = page.getByRole("listitem").filter({ hasText: share.token.slice(0, 8) });
    await row.getByRole("button", { name: "Revoke link", exact: true }).click();
    await page.getByRole("button", { name: "Confirm revocation", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); await expect(row).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Shared hands", exact: true }).getByRole("alert")).toHaveText("Shared hands could not be loaded.");
    await expect(page.getByText("Unable to confirm the share. Refresh its status before trying again.")).toHaveCount(0);
  } finally { await fixture.guestContext.close(); }
});
