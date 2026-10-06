import { expect, test, type Page } from "@playwright/test";

async function submit(page: Page, type: string, amount?: number, keyboard = false) {
  const response = page.waitForResponse(r => r.url().endsWith("/action") && r.request().method() === "POST");
  if (keyboard) {
    await page.locator("main").click({ position: { x: 1, y: 1 } });
    await page.keyboard.press("d");
  } else {
    await page.getByRole("button", { name: new RegExp(`^${type}`) }).click();
  }
  const result = await response;
  expect(result.ok()).toBe(true);
  expect(result.request().postDataJSON().action).toEqual({ type: type.toLowerCase(), ...(amount === undefined ? {} : { amount }) });
  return (await result.json()).game;
}

test("synchronizes targets, validates edits, resets decisions, and fits mobile", async ({ browser, page }) => {
  test.setTimeout(90_000);
  await page.goto("/en-US");
  await page.goto("/en-US/play");
  await page.getByRole("button", { name: "Create table" }).click();
  await expect(page).toHaveURL(/\/game\//);
  await page.getByRole("combobox", { name: "Seats" }).selectOption("2");
  await page.getByLabel("Small blind", { exact: true }).fill("50");
  await page.getByLabel("Big blind", { exact: true }).fill("100");
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(page.url());
  await guest.getByRole("button", { name: "Sit here" }).first().click();
  await expect(page.getByRole("button", { name: "Start hand" })).toBeEnabled();
  await page.getByRole("button", { name: "Start hand" }).click();
  const input = page.getByRole("spinbutton", { name: "Bet amount", exact: true });
  const slider = page.getByRole("slider");
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("200");
  await page.getByRole("button", { name: "50% pot", exact: true }).click();
  await expect(input).toHaveValue("200");
  await page.getByRole("button", { name: "75% pot", exact: true }).click();
  await expect(input).toHaveValue("250");
  await page.getByRole("button", { name: "All-in", exact: true }).click();
  await expect(input).toHaveValue("10000");
  await expect(page.getByText("+9,950", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pot", exact: true }).click();
  await expect(input).toHaveValue("300");
  await expect(slider).toHaveValue("300");
  await expect(page.getByText("+250", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Raise to 300", exact: true })).toBeEnabled();
  await page.screenshot({ path: "test-results/betting-desktop.png", fullPage: true });
  const callButton = page.getByRole("button", { name: "Call 50", exact: true });
  const colors = () => callButton.evaluate(element => {
    const style = getComputedStyle(element);
    return { text: style.color, background: style.backgroundImage };
  });
  const restingColors = await colors();
  await callButton.hover();
  await expect.poll(async () => (await colors()).text).toBe(restingColors.text);
  // The green surface must remain dark on hover and keyboard focus.
  for (const focus of [false, true]) {
    if (focus) {
      await page.mouse.move(0, 0);
      await callButton.focus();
    }
    const currentColors = await colors();
    expect(currentColors.text).toBe("rgb(255, 254, 245)");
    expect(currentColors.background).toContain("linear-gradient");
    const backgrounds = [...currentColors.background.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)];
    expect(backgrounds).toHaveLength(2);
    for (const background of backgrounds) {
      const linear = background.slice(1).map(value => {
        const channel = Number(value) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      expect(1 / (luminance + 0.05)).toBeGreaterThan(4.5);
    }
  }
  await input.fill("425");
  await expect(slider).toHaveValue("425");
  await slider.press("ArrowRight");
  await expect(input).toHaveValue("525");
  await slider.press("Shift+ArrowRight");
  await expect(input).toHaveValue("1025");
  await slider.press("Shift+ArrowLeft");
  await expect(input).toHaveValue("525");
  await slider.press("Shift+Q");
  await expect(input).toHaveValue("200");
  await slider.press("Shift+E");
  await expect(input).toHaveValue("700");
  await input.fill("525");
  await page.locator("main").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("q");
  await expect(input).toHaveValue("425");
  await page.keyboard.press("e");
  await expect(input).toHaveValue("525");

  await page.keyboard.press("Shift+E");
  await expect(input).toHaveValue("1025");
  await page.keyboard.press("Shift+Q");
  await expect(input).toHaveValue("525");

  // A same-version authoritative refetch must preserve an in-progress draft.
  const refetch = page.waitForResponse(r => /\/api\/games\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method() === "GET");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refetch;
  await expect(input).toHaveValue("525");
  for (const invalid of ["", "250.5", "-1", "10001", "9007199254740992"]) {
    await input.fill(invalid);
    await expect(page.getByRole("button", { name: "Raise to -", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Fold", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Call 50", exact: true })).toBeEnabled();
    await page.locator("main").click({ position: { x: 1, y: 1 } });
    const requests: string[] = [];
    const listen = (request: import("@playwright/test").Request) => { if (request.url().endsWith("/action")) requests.push(request.url()); };
    page.on("request", listen);
    await page.keyboard.press("d");
    await expect(input).toHaveValue(invalid);
    expect(requests).toEqual([]);
    page.off("request", listen);
  }
  await input.fill("400");
  await input.press("d");
  await expect(input).toHaveValue("400");
  await page.getByRole("button", { name: "Pot", exact: true }).click();
  const raised = await submit(page, "Raise", 300);
  const spectator = await browser.newContext();
  const publicResponse = await spectator.request.get(new URL(`/api/games/${raised.id}`, page.url()).href);
  expect(publicResponse.ok()).toBe(true);
  const publicGame = (await publicResponse.json()).game;
  expect(publicGame.poker.players.every((p: { holeCards: unknown; playerToken: unknown }) => p.holeCards === null && p.playerToken === null)).toBe(true);
  expect(publicGame.poker.players.sort((a: { seat: number }, b: { seat: number }) => a.seat - b.seat).map((p: { committedStreet: number }) => p.committedStreet)).toEqual([300, 100]);
  await spectator.close();
  const actor = raised.poker.players.find((p: { id: string }) => p.id === raised.poker.currentActorId);
  expect(actor.committedStreet).toBe(100);
  await expect(guest.getByRole("spinbutton")).toBeEnabled();
  await expect(guest.getByRole("spinbutton")).toHaveValue("500");
  await guest.getByRole("button", { name: "Pot", exact: true }).click();
  await expect(guest.getByRole("spinbutton")).toHaveValue("900");
  await submit(guest, "Raise", 900, true);
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("1500");
  await input.fill("1800");
  await submit(page, "Call", 600);
  const betInput = guest.getByRole("spinbutton", { name: "Bet amount", exact: true });
  await expect(betInput).toBeEnabled();
  await expect(betInput).toHaveValue("100");
  await betInput.fill("800");
  await submit(guest, "Check");
  await expect(page.getByRole("spinbutton", { name: "Bet amount", exact: true })).toHaveValue("100");
  await page.getByRole("spinbutton").fill("700");
  await submit(page, "Fold");
  await page.getByRole("button", { name: "Next Hand", exact: true }).click();
  await expect(guest.getByRole("spinbutton")).toBeEnabled();
  await expect(guest.getByRole("spinbutton")).toHaveValue("200");

  await guest.setViewportSize({ width: 375, height: 812 });
  await expect(guest.getByRole("spinbutton")).toBeVisible();
  expect(await guest.getByRole("spinbutton").getAttribute("inputmode")).toBe("numeric");
  const layout = await guest.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, targets: [...document.querySelector("#bet-target")!.closest("section")!.querySelectorAll("input, button")].map(e => e.getBoundingClientRect().height) }));
  await guest.screenshot({ path: "test-results/betting-mobile.png", fullPage: true });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.targets.every(height => height >= 44)).toBe(true);
  await guestContext.close();
});
