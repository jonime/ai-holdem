import type { Game } from "../../components/poker/types";
import { expect, test, type Page } from "@playwright/test";

async function waitForPlayableHuman(page: Page) {
  const actionButton = page.getByRole("button", { name: /^(Call|Check)/ });
  await expect(actionButton).toBeEnabled({
    timeout: 10_000,
  });
  return actionButton;
}

test("starts six-seat Quick Play and advances the opening bot turns", { tag: "@smoke" }, async ({
  page,
}) => {
  test.setTimeout(30_000);
  await page.goto("/en-US");
  const firstBotStep = page.waitForResponse(
    (response) =>
      response.url().endsWith("/step") && response.request().method() === "POST",
  );
  await page
    .getByRole("region", { name: "Choose how to play" })
    .getByRole("button", { name: "Quick Play vs AI" })
    .click();

  await expect(page).toHaveURL(/\/en-US\/game\/[0-9a-f-]+$/);
  await expect(page.getByText("WAITING ROOM")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Preflop", exact: true })).toBeVisible();
  await expect(
    page.getByText(/^EQUITY RULES #/).first(),
  ).toBeVisible();
  await firstBotStep;
  await waitForPlayableHuman(page);
});

test("runs a two-player hand in a six-seat lobby", async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/en-US");
  await page
    .getByRole("region", { name: "Choose how to play" })
    .getByRole("button", { name: "Create custom table" })
    .click();
  await expect(page).toHaveURL(/\/en-US\/game\/[0-9a-f-]+$/);
  const gameUrl = page.url();

  await expect(page.getByText("WAITING ROOM")).toBeVisible();
  await expect(
    page.getByText("Add a bot to an open seat, or invite a friend."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Deal a hand" })).toHaveCount(
    0,
  );
  await page.getByLabel("Seats").selectOption("6");
  await expect(
    page.locator("article").filter({ hasText: "Seat 6" }),
  ).toBeVisible();
  await expect(page.getByText("Available").first()).toBeVisible();

  const secondBrowser = await browser.newContext();
  const secondPage = await secondBrowser.newPage();
  await secondPage.goto(gameUrl);
  await expect(secondPage.getByText("WAITING ROOM")).toBeVisible();
  await expect(
    secondPage.getByText("Choose an open seat to join."),
  ).toBeVisible();
  await secondPage.getByRole("button", { name: "Sit here" }).first().click();
  await expect(secondPage.getByText("Player 2", { exact: true })).toBeVisible();
  await expect(
    secondPage.getByText("You’re seated. Waiting for the host to start."),
  ).toBeVisible();

  await expect(page.getByText("Player 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start hand" })).toBeEnabled();
  await expect(
    secondPage.getByRole("button", { name: "Start hand" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Start hand" }).click();

  await expect(page.getByRole("heading", { name: "Preflop", exact: true })).toBeVisible();
  await expect(
    page.getByText("PLAYER 2", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Open seat", { exact: true }).first(),
  ).toBeVisible();

  const callButton = await Promise.race([
    waitForPlayableHuman(page),
    waitForPlayableHuman(secondPage),
  ]);
  await callButton.click();
  await expect(page.getByText("Unable to submit human action")).toHaveCount(0);
  await expect(
    secondPage.getByText("Unable to submit human action"),
  ).toHaveCount(0);

  await secondBrowser.close();
});

test("persists a per-bot difficulty selected in the lobby", async ({
  page,
}) => {
  await page.goto("/en-US");
  await page
    .getByRole("region", { name: "Choose how to play" })
    .getByRole("button", { name: "Create custom table" })
    .click();
  await expect(page.getByText("WAITING ROOM")).toBeVisible();

  await page.getByLabel("Bot difficulty for seat 2").selectOption("hard");
  await page.getByRole("button", { name: "Assign bot" }).first().click();
  const gameId = new URL(page.url()).pathname.split("/").at(-1);
  const readAssignedBot = async () => {
    const response = await page.request.get(`/api/games/${gameId}`);
    expect(response.ok()).toBe(true);
    const { game } = await response.json() as { game: Game };
    return game.poker.players.find((player) => player.seat === 1);
  };
  await expect.poll(readAssignedBot).toMatchObject({ status: "bot", aiDifficulty: "hard" });

  await page.reload();
  await expect.poll(readAssignedBot).toMatchObject({ status: "bot", aiDifficulty: "hard" });
});

test("shows the localized LLM bot playstyles", async ({ page }) => {
  await page.goto("/en-US");
  await page
    .getByRole("region", { name: "Choose how to play" })
    .getByRole("button", { name: "Create custom table" })
    .click();
  await expect(page.getByText("WAITING ROOM")).toBeVisible();

  await page.getByLabel("Bot for seat 2").selectOption("llm-test-model");
  const playstyle = page.getByLabel("Bot playstyle for seat 2");
  await expect(playstyle).toBeVisible();
  await expect(playstyle.locator("option")).toHaveText([
    "Balanced",
    "Tight",
    "Aggressive",
  ]);
  await page.screenshot({
    path: "test-results/llm-playstyle-selector.png",
    fullPage: true,
  });
});

test("recovers through polling and after coming back online", async ({
  browser,
  page,
}) => {
  test.setTimeout(30_000);
  await page.goto("/en-US");
  await page
    .getByRole("region", { name: "Choose how to play" })
    .getByRole("button", { name: "Create custom table" })
    .click();
  await expect(page.getByText("WAITING ROOM")).toBeVisible();

  const spectatorContext = await browser.newContext();
  await spectatorContext.routeWebSocket(
    /\/realtime\/v1\/websocket/,
    () => undefined,
  );
  const spectator = await spectatorContext.newPage();
  await spectator.goto(page.url());
  await expect(spectator.getByText("WAITING ROOM")).toBeVisible();

  const gameId = new URL(page.url()).pathname.split("/").at(-1);
  const updateSettings = async (startingStack: number) => {
    const { game } = await (await page.request.get(`/api/games/${gameId}`)).json() as { game: Game };
    const response = await page.request.patch(`/api/games/${gameId}/settings`, {
      data: { expectedVersion: game.version, seatCount: 4, smallBlind: 50, bigBlind: 100, startingStack, botsShowUncontestedWins: false },
    });
    expect(response.ok()).toBe(true);
  };
  await updateSettings(10000);
  await expect(
    spectator.getByLabel("Table settings").getByText("4", { exact: true }),
  ).toBeVisible({ timeout: 8_000 });

  await spectatorContext.setOffline(true);
  await expect.poll(() => spectator.evaluate(() => navigator.onLine)).toBe(false);
  await updateSettings(5000);
  await expect(spectator.getByLabel("Table settings").getByText("10,000", { exact: true })).toBeVisible();
  await spectatorContext.setOffline(false);
  await expect(spectator.getByText("5,000", { exact: true })).toBeVisible({
    timeout: 8_000,
  });

  await spectatorContext.close();
});

test("runs the deterministic bot through completion, history, and another hand", { tag: "@smoke" }, async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/en-US");
  await page
    .getByRole("region", { name: "Choose how to play" })
    .getByRole("button", { name: "Create custom table" })
    .click();
  await expect(page.getByText("WAITING ROOM")).toBeVisible();

  await page.getByLabel("Bot for seat 2").selectOption("equity-rules-v2");
  await page.getByRole("button", { name: "Assign bot" }).first().click();
  await expect(
    page.getByText("Equity Rules #1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Ready to play. Select Start hand."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Equity Rules #1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start hand" }).click();

  const checkOrCall = await waitForPlayableHuman(page);
  await checkOrCall.click();
  const fold = page.getByRole("button", { name: "Fold" });
  await expect(fold).toBeEnabled({ timeout: 10_000 });
  await fold.click();
  await expect(page.getByText("COMPLETE")).toBeVisible({ timeout: 15_000 });
  const actions = page.getByRole("complementary", { name: "Actions" });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("listitem").filter({ hasText: "Equity Rules" }).first()).toBeVisible();
  const gameId = new URL(page.url()).pathname.split("/").at(-1);
  const history = await page.request.get(`/api/games/${gameId}/history?hand=1`);
  expect(history.ok()).toBe(true);

  await page.getByRole("button", { name: "Next Hand" }).click();
  await expect(page.getByText("Hand 2")).toBeVisible({ timeout: 15_000 });
});

test("persists host table settings when starting a hand", async ({ browser, page }) => {
  await page.goto("/en-US");
  await page
    .getByRole("region", { name: "Choose how to play" })
    .getByRole("button", { name: "Create custom table" })
    .click();
  await expect(page.getByText("WAITING ROOM")).toBeVisible();

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(page.url());
  await guest.getByRole("button", { name: "Sit here" }).first().click();
  await expect(page.getByRole("button", { name: "Start hand" })).toBeEnabled();
  await page.getByLabel("Seats").selectOption("4");
  await page.getByLabel("Small blind").fill("25");
  await page.getByLabel("Big blind").fill("50");
  await page.getByLabel("Starting stack").fill("5000");
  await page.getByRole("button", { name: "Start hand" }).click();
  await expect(page.getByRole("button", { name: "Fold", exact: true })).toBeEnabled();
  const gameId = new URL(page.url()).pathname.split("/").at(-1);
  const checkSettings = async () => {
    const { game } = await (await page.request.get(`/api/games/${gameId}`)).json() as { game: Game };
    expect(game.poker).toMatchObject({ seatCount: 4, smallBlind: 25, bigBlind: 50, startingStack: 5000 });
  };
  await checkSettings();
  await page.reload();
  await expect(page.getByRole("button", { name: "Fold", exact: true })).toBeEnabled();
  await checkSettings();
  await guestContext.close();
});

test("copies a clean invite URL and exposes a manual fallback", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/en-US");
  await page
    .getByRole("region", { name: "Choose how to play" })
    .getByRole("button", { name: "Create custom table" })
    .click();
  await expect(page.getByText("WAITING ROOM")).toBeVisible();

  const cleanUrl = page.url();
  await page.goto(`${cleanUrl}?playerToken=must-not-copy#private-fragment`);
  const copyButton = page.getByRole("button", { name: "Copy invite link" });
  await copyButton.focus();
  await expect(copyButton).toBeFocused();
  await copyButton.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Invite link copied.");
  const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedUrl).toBe(cleanUrl);
  expect(copiedUrl).not.toContain("?");
  expect(copiedUrl).not.toContain("#");
  expect(new URL(copiedUrl).username).toBe("");
  expect(new URL(copiedUrl).password).toBe("");

  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("clipboard denied")),
    });
  });
  await copyButton.press("Enter");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Copy the invite link manually" }),
  ).toContainText(
    "Copy the invite link manually from this field.",
  );
  const manualLink = page.getByRole("textbox", { name: "Invite link" });
  await expect(manualLink).toHaveValue(cleanUrl);
  await manualLink.click();
  await expect
    .poll(() =>
      manualLink.evaluate((input: HTMLInputElement) => [
        input.selectionStart,
        input.selectionEnd,
      ]),
    )
    .toEqual([0, cleanUrl.length]);
});

test("claims, moves, assigns bots, and releases seats while retaining unseated host authority", { tag: "@smoke" }, async ({ page, browser }) => {
  await page.goto("/en-US");
  await page.getByRole("button", { name: "Create custom table" }).click();
  await expect(page.getByText("WAITING ROOM")).toBeVisible();
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    await guest.goto(page.url());
    const seat = (target: Page, number: number) => target.locator("article").nth(number - 1);
    await seat(guest, 2).getByRole("button", { name: "Sit here" }).click();
    await expect(seat(guest, 2).getByRole("button", { name: "Stand up" })).toBeVisible();
    await seat(guest, 3).getByRole("button", { name: "Sit here" }).click();
    await expect(seat(guest, 3).getByRole("button", { name: "Stand up" })).toBeVisible();
    await expect(seat(guest, 2).getByRole("button", { name: "Sit here" })).toBeVisible();
    await seat(guest, 3).getByRole("button", { name: "Stand up" }).click();
    await expect(seat(guest, 3).getByRole("button", { name: "Sit here" })).toBeVisible();
    // Load committed guest changes before the version-checked host mutation.
    await page.reload();
    await expect(page.getByText("WAITING ROOM")).toBeVisible();
    await page.getByRole("button", { name: "Stand up" }).click();
    await expect(seat(page, 1).getByRole("button", { name: "Sit here" })).toBeVisible();
    await page.getByLabel("Bot for seat 2").selectOption("equity-rules-v2");
    await seat(page, 2).getByRole("button", { name: "Assign bot" }).click();
    await expect(seat(page, 2).getByRole("button", { name: "Remove bot" })).toBeVisible();
    await seat(page, 2).getByRole("button", { name: "Remove bot" }).click();
    await expect(seat(page, 2).getByRole("button", { name: "Assign bot" })).toBeVisible();
    await expect(page.getByText(/Unable to (claim|release|assign)/)).toHaveCount(0);
  } finally {
    await guestContext.close();
  }
});
