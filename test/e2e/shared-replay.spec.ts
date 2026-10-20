import { expect, test, type Page } from "./fixtures";
import { completed } from "./replay-fixtures";
import { sharedReplaySchema } from "../../lib/http/share-contracts";
async function review(page: Page) {
  await page.getByRole("complementary", { name: "Actions" }).getByRole("button", { name: "Review", exact: true }).last().click();
  await page.getByRole("button", { name: "Share hand", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create share link", exact: true })).toBeVisible();
}
async function create(page: Page) {
  await expect(page.getByText(/Anyone can forward this link/)).toBeVisible();
  await page.getByRole("button", { name: "Create share link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
}
test("shares fixed snapshots, copies with fallback, plays without live activity and revokes", { tag: "@ui-regression" }, async ({ page, browser }) => {
  const f = await completed(browser, page);
  const recipient = await browser.newContext();
  try {
    await page.getByRole("complementary", { name: "Actions" }).getByRole("button", { name: "Review", exact: true }).last().click();
    await page.getByRole("button", { name: "Result", exact: true }).click();
    const selected = await page.locator("[data-replay-frame]").getAttribute("data-replay-frame");
    const folded = page.locator('[data-replay-folded="true"]').first();
    await expect(folded).toHaveCSS("opacity", "0.6");
    await page.getByRole("button", { name: "Share hand", exact: true }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(2);
    await expect(page.locator('dialog[aria-label="Review hand"]')).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Share replay - Hand 1", exact: true })).toBeVisible();
    const sharing = page.getByRole("dialog", { name: "Share replay - Hand 1", exact: true });
    await expect(sharing.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    for (let index = 0; index < 6; index++) {
      await page.keyboard.press("Tab");
      // Native dialogs may move focus to browser chrome (document.body), never the replay.
      expect(await sharing.evaluate(node => node.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath("sharing-notice.png") });
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Share hand", exact: true })).toBeFocused();
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    await expect(page.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", selected!);
    await page.getByRole("button", { name: "Share hand", exact: true }).click();
    await create(page);
    await expect(page.getByText(/^Expires /)).toBeVisible();
    const copyRect = await page.getByRole("button", { name: "Copy link", exact: true }).boundingBox();
    const revokeRect = await page.getByRole("button", { name: "Revoke link", exact: true }).boundingBox();
    expect(copyRect!.y).toBe(revokeRect!.y);
    await page.screenshot({ path: test.info().outputPath("sharing-dialog.png") });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await sharing.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const mobileCopy = await sharing.getByRole("button", { name: "Copy link", exact: true }).boundingBox();
    const mobileRevoke = await sharing.getByRole("button", { name: "Revoke link", exact: true }).boundingBox();
    expect(mobileCopy!.y).toBe(mobileRevoke!.y);
    await page.screenshot({ path: test.info().outputPath("sharing-mobile.png") });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.mouse.click(10, 10);
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Share hand", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Share hand", exact: true }).click();
    await expect(sharing).toBeVisible();
    const management = await (await page.request.get(`/api/games/${f.id}/hands/1/share`)).json();
    const again = await page.request.post(`/api/games/${f.id}/hands/1/share`, { headers: { origin: new URL(page.url()).origin } });
    expect(await again.json()).toEqual(management);
    const token = management.share.token;
    const path = `/replay/${token}`;
    const snapshotResponse = await page.request.get(`/api/replays/${token}`);
    expect(snapshotResponse.headers()["cache-control"]).toBe("private, no-store");
    const snapshot = sharedReplaySchema.parse(await snapshotResponse.json());
    expect(snapshot.replay.frames.every(frame => frame.players.filter(p => p.cards !== null).length === 1)).toBe(true);
    const before = await f.read();
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as Window & { copied?: string }).copied = text; } } }));
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Link copied." })).toBeVisible();
    expect(await page.evaluate(() => (window as Window & { copied?: string }).copied)).toContain(path);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } }));
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Share URL" })).toHaveValue(new RegExp(`${path}$`));
    const visitor = await recipient.newPage();
    const requests: string[] = [], sockets: string[] = [];
    visitor.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(new URL(request.url()).pathname); });
    visitor.on("websocket", socket => sockets.push(socket.url()));
    const html = await visitor.goto(path);
    expect(html!.headers()["referrer-policy"]).toBe("no-referrer");
    expect(html!.headers()["cache-control"]).toContain("no-store");
    const body = await html!.text();
    expect(body).not.toContain(f.id);
    expect(body).not.toMatch(/engineState|playerToken|stateBefore/);
    expect(body).toContain("noindex, nofollow");
    const pageHeader = visitor.getByRole("banner");
    await expect(pageHeader.getByRole("heading", { name: "Shared replay", exact: true })).toHaveCSS("font-size", "20px");
    await expect(pageHeader.getByRole("link", { name: "AI Hold'em", exact: true })).toHaveAttribute("href", "/");
    await expect(visitor.getByRole("main").getByRole("link", { name: "Home", exact: true })).toHaveCount(0);
    await expect(visitor.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "0");
    // No click or programmatic focus: page-level arrows work immediately after load.
    expect(await visitor.evaluate(() => document.activeElement === document.body)).toBe(true);
    await visitor.keyboard.press("ArrowRight");
    await expect(visitor.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "1");
    await visitor.keyboard.press("ArrowLeft");
    await expect(visitor.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "0");
    await pageHeader.getByRole("link").focus();
    await visitor.keyboard.press("ArrowRight");
    await expect(visitor.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "0");
    await visitor.evaluate(() => {
      const input = document.createElement("input");
      input.id = "keyboard-scope-test";
      document.querySelector("main")!.append(input);
      input.focus();
    });
    await visitor.keyboard.press("ArrowRight");
    await expect(visitor.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "0");
    await visitor.evaluate(() => document.querySelector("#keyboard-scope-test")!.remove());
    await visitor.keyboard.press("Control+ArrowRight");
    await expect(visitor.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "0");
    await visitor.getByRole("button", { name: "Next", exact: true }).click();
    await expect(visitor.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "1");
    await visitor.getByRole("button", { name: "Result", exact: true }).click();
    await visitor.keyboard.press("ArrowLeft");
    await expect(visitor.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "1");
    await visitor.keyboard.press("ArrowLeft");
    await expect(visitor.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "0");
    await expect(visitor.locator(`a[href*="${f.id}"]`)).toHaveCount(0);
    await visitor.screenshot({ path: test.info().outputPath("shared-replay.png") });
    expect(requests).toEqual([`/api/replays/${token}`]); expect(sockets).toEqual([]);
    expect((await f.read()).version).toBe(before.version);
    // Recipient ownership cookies cannot expand a frozen share.
    const guestSnapshot = await (await f.guest.request.get(`/api/replays/${token}`)).json();
    expect(guestSnapshot).toEqual(snapshot);
    expect((await visitor.request.delete(`/api/games/${f.id}/hands/1/share`, { headers: { origin: new URL(page.url()).origin } })).status()).toBe(403);
    expect((await page.request.post(`/api/games/${f.id}/hands/1/share`, { headers: { origin: "https://other.test" } })).status()).toBe(403);
    await visitor.goto(`/fi-FI${path}`);
    await expect(visitor.getByRole("banner").getByRole("heading", { name: "Jaettu uusinta" })).toBeVisible();
    await expect(visitor.getByRole("banner").getByRole("link")).toHaveAttribute("href", "/fi-FI");
    await expect(visitor.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "0");
    await visitor.goto(`/en-US${path}`); await expect(visitor).toHaveURL(new RegExp(`${path}$`));
    await page.getByRole("button", { name: "Revoke link", exact: true }).click();
    await expect(page.getByText(/Downloaded copies cannot be erased/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm revocation", exact: true }).click();
    await expect(page.getByRole("button", { name: "Create share link", exact: true })).toBeVisible();
    await visitor.goto(path);
    await expect(visitor.getByText("This hand cannot be reviewed.", { exact: true })).toBeVisible();
    expect((await visitor.request.get(`/api/replays/${token}`)).status()).toBe(404);
    await sharing.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
  } finally { await recipient.close(); await f.guestContext.close(); }
});

test("reconciles a lost creation response without replay and retries standalone reads", { tag: "@ui-regression" }, async ({ page, browser }) => {
  const f = await completed(browser, page);
  try {
    await review(page);
    let creations = 0;
    await page.route(`**/api/games/${f.id}/hands/1/share`, async route => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      creations++; await route.fetch(); await route.abort("failed");
    });
    await create(page); expect(creations).toBe(1);
    const { share } = await (await page.request.get(`/api/games/${f.id}/hands/1/share`)).json();
    await page.unrouteAll({ behavior: "wait" });
    let fail = true;
    await page.route(`**/api/replays/${share.token}`, async route => { if (fail) { fail = false; await route.abort("failed"); } else await route.continue(); });
    await page.goto(`/replay/${share.token}`);
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.locator("[data-replay-frame]")).toHaveAttribute("data-replay-frame", "0");
    await page.goto(`/replay/${"b".repeat(64)}`);
    await expect(page.getByText("This hand cannot be reviewed.", { exact: true })).toBeVisible();
  } finally { await f.guestContext.close(); }
});

test("dismissed sharing diagnostics cannot return from a late failed recovery", { tag: "@ui-regression" }, async ({ page, browser }) => {
  const f = await completed(browser, page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  try {
    await review(page);
    let recoveries = 0;
    await page.route(`**/api/games/${f.id}/hands/1/share`, async route => {
      if (route.request().method() === "POST") { await route.abort("failed"); return; }
      recoveries++;
      await held;
      await route.fulfill({ status: 500, json: { error: "Unable to manage share", requestReference: "0bd9c338-033b-4f52-a06d-129927318d54" } });
    });
    await page.getByRole("button", { name: "Create share link", exact: true }).click();
    const sharing = page.getByRole("dialog", { name: "Share replay - Hand 1", exact: true });
    await expect(sharing.getByRole("button", { name: "Copy error details" })).toBeVisible();
    await expect.poll(() => recoveries).toBe(1);
    await sharing.getByRole("button", { name: "Close", exact: true }).click();
    const recovered = page.waitForResponse(response => response.url().endsWith("/hands/1/share") && response.status() === 500);
    release(); await recovered;
    await page.getByRole("button", { name: "Share hand", exact: true }).click();
    await expect(sharing.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(sharing.getByRole("button", { name: "Copy error details" })).toHaveCount(0);
  } finally { release?.(); await f.guestContext.close(); }
});
