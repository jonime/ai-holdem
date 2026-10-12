import { expect, test, type Locator, type Page } from "./fixtures";
import { createUITable } from "./ui-fixtures";

async function activate(control: Locator, mobile: boolean) {
  if (mobile) await control.tap();
  else await control.click();
}

// Two humans keep this real engine turn stable while inspecting browser controls.
async function humanTable(page: Page) {
  const id = await createUITable(page);
  await page.goto(`/game/${id}`);
  await page.getByRole("combobox", { name: "Seats" }).selectOption("2");
  await page.getByLabel("Small blind", { exact: true }).fill("50");
  await page.getByLabel("Big blind", { exact: true }).fill("100");
  const guest = await page.context().browser()!.newContext();
  try {
    const other = await guest.newPage();
    await other.goto(page.url());
    await other.getByRole("button", { name: "Sit here" }).first().click();
    await expect(page.getByRole("button", { name: "Start hand" })).toBeEnabled();
    await page.getByRole("button", { name: "Start hand" }).click();
    await expect(page.getByRole("spinbutton", { name: "Bet amount", exact: true })).toBeEnabled();
  } finally {
    await guest.close();
  }
  return id;
}

test("betting input, presets and one legal action", { tag: "@compatibility" }, async ({ page, isMobile }) => {
  await humanTable(page);
  const input = page.getByRole("spinbutton", { name: "Bet amount", exact: true });
  const slider = page.getByRole("slider");
  await activate(input, isMobile);
  await input.fill("425");
  await expect(slider).toHaveValue("425");
  if (!isMobile) {
    await slider.press("ArrowRight");
    await expect(input).toHaveValue("525");
    await slider.press("Shift+ArrowRight");
    await expect(input).toHaveValue("1025");
  } else {
    await expect(input).toHaveAttribute("inputmode", "numeric");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await input.evaluate(n => n.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await activate(page.getByRole("button", { name: "All-in", exact: true }), isMobile);
  await expect(input).toHaveValue("10000");
  await activate(page.getByRole("button", { name: "Pot", exact: true }), isMobile);
  await expect(input).toHaveValue("300");
  await expect(slider).toHaveValue("300");
  const response = page.waitForResponse(r => r.url().endsWith("/action") && r.request().method() === "POST");
  await activate(page.getByRole("button", { name: "Raise to 300", exact: true }), isMobile);
  const committed = await response;
  expect(committed.ok()).toBe(true);
  expect(committed.request().postDataJSON().action).toEqual({ type: "raise", amount: 300 });
  const game = (await committed.json()).game;
  expect(game.poker.players.find((p: { seat: number }) => p.seat === 0).committedStreet).toBe(300);
  await page.screenshot({ path: test.info().outputPath("betting.png"), fullPage: true });
});

test("Help and Settings scroll, lock the background and restore focus", { tag: "@compatibility" }, async ({ page, isMobile }) => {
  const id = await createUITable(page);
  await page.goto(`/game/${id}`);
  // Short landscape viewport makes both dialogs' real content overflow.
  await page.setViewportSize({ width: isMobile ? 844 : 1280, height: 390 });
  for (const name of ["Help", "Settings"]) {
    const opener = page.getByRole("button", { name, exact: true });
    const before = await page.evaluate(() => ({ y: scrollY, html: document.documentElement.style.overflow, body: document.body.style.overflow }));
    await activate(opener, isMobile);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Close/ })).toBeFocused();
    await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    const scroll = dialog.locator(name === "Help" ? '[class*="helpScroll"]' : '[class*="content"]');
    expect(await scroll.evaluate(n => n.scrollHeight > n.clientHeight)).toBe(true);
    // WebKit scroll-container behavior; physical touch scrolling is also in the device checklist.
    if (isMobile) {
      await scroll.evaluate(n => n.scrollBy(0, 150));
    } else {
      await scroll.hover();
      await page.mouse.wheel(0, 150);
    }
    await expect.poll(() => scroll.evaluate(n => n.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => scrollY)).toBe(before.y);
    await page.screenshot({ path: test.info().outputPath(`${name.toLowerCase()}.png`) });
    if (isMobile) await dialog.getByRole("button", { name: /^Close/ }).tap();
    else await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => ({ html: document.documentElement.style.overflow, body: document.body.style.overflow })))
      .toEqual({ html: before.html, body: before.body });
  }
});

test("disabled shortcuts preserve focused native controls and survive reload", { tag: "@compatibility" }, async ({ page, isMobile }) => {
  await humanTable(page);
  await activate(page.getByRole("button", { name: "Settings", exact: true }), isMobile);
  await activate(page.getByRole("switch", { name: "Gameplay shortcuts", exact: true }), isMobile);
  await activate(page.getByRole("button", { name: "Close", exact: true }), isMobile);
  await expect(page.locator("[aria-keyshortcuts]")).toHaveCount(0);
  const input = page.getByRole("spinbutton", { name: "Bet amount", exact: true });
  const slider = page.getByRole("slider");
  await slider.press("ArrowRight");
  await expect(input).toHaveValue("201");
  await activate(input, isMobile);
  await input.fill("300");
  await input.press("q");
  await expect(input).toHaveValue("300");
  await page.reload();
  await expect(input).toBeEnabled();
  await expect(page.locator("[aria-keyshortcuts]")).toHaveCount(0);
  await activate(page.getByRole("button", { name: "Settings", exact: true }), isMobile);
  await expect(page.getByRole("switch", { name: "Gameplay shortcuts", exact: true })).toHaveAttribute("aria-checked", "false");
});
