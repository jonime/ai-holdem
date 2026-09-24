import { expect, test, type Page } from "@playwright/test";

async function waitForPlayableHuman(page: Page) {
  const actionButton = page.getByRole("button", { name: /^(Call|Check)/ });
  await expect(actionButton).toBeEnabled({
    timeout: 10_000,
  });
  return actionButton;
}

test("runs a two-player hand in a six-seat lobby", async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/en-US");
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/games") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("region", { name: "Start a new game" })
    .getByRole("button", { name: "New Game" })
    .click();
  const createResponse = await createResponsePromise;
  const createBody = await createResponse.text();
  expect(createResponse.ok(), createBody).toBe(true);
  await expect(page).toHaveURL(/\/en-US\/game\/[0-9a-f-]+$/);
  const gameUrl = page.url();

  await expect(page.getByText("WAITING ROOM")).toBeVisible();
  await expect(page.getByRole("button", { name: "Deal a hand" })).toHaveCount(
    0,
  );
  await page.getByLabel("Seats").selectOption("6");
  await expect(page.locator("article").filter({ hasText: "Seat 6" })).toBeVisible();
  await expect(page.getByText("Available").first()).toBeVisible();

  const secondBrowser = await browser.newContext();
  const secondPage = await secondBrowser.newPage();
  await secondPage.goto(gameUrl);
  await expect(secondPage.getByText("WAITING ROOM")).toBeVisible();
  await secondPage.getByRole("button", { name: "Sit here" }).first().click();
  await expect(secondPage.getByText("Player 2", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Player 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start hand" })).toBeEnabled();
  await expect(
    secondPage.getByRole("button", { name: "Start hand" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Start hand" }).click();

  await expect(page.getByText("PREFLOP")).toBeVisible();
  await expect(page.getByText("PLAYER 2", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Open seat", { exact: true }).first()).toBeVisible();

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
    .getByRole("region", { name: "Start a new game" })
    .getByRole("button", { name: "New Game" })
    .click();
  await expect(page.getByText("WAITING ROOM")).toBeVisible();

  await page.getByLabel("Bot difficulty for seat 2").selectOption("hard");
  await page.getByRole("button", { name: "Assign bot" }).first().click();
  await expect(page.getByText("TypeSafe Jev · hard")).toBeVisible();

  await page.reload();
  await expect(page.getByText("TypeSafe Jev · hard")).toBeVisible();
});

test("runs the deterministic bot through completion, history, and another hand", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/en-US");
  await page
    .getByRole("region", { name: "Start a new game" })
    .getByRole("button", { name: "New Game" })
    .click();
  await expect(page.getByText("WAITING ROOM")).toBeVisible();

  await page.getByLabel("Bot for seat 2").selectOption("basic-equity-v1");
  await page.getByRole("button", { name: "Assign bot" }).first().click();
  await expect(page.getByText("Basic equity #1", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Basic equity #1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start hand" }).click();

  const checkOrCall = await waitForPlayableHuman(page);
  await checkOrCall.click();
  const fold = page.getByRole("button", { name: "Fold" });
  await expect(fold).toBeEnabled({ timeout: 10_000 });
  await fold.click();
  await expect(page.getByText("COMPLETE")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("Action History")).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Basic equity" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close action history" }).click();

  await page.getByRole("button", { name: "Next Hand" }).click();
  await expect(page.getByText("Hand 2")).toBeVisible({ timeout: 15_000 });
});

test("persists host table settings selected in the lobby", async ({ page }) => {
  await page.goto("/en-US");
  await page
    .getByRole("region", { name: "Start a new game" })
    .getByRole("button", { name: "New Game" })
    .click();
  await expect(page.getByText("WAITING ROOM")).toBeVisible();

  await page.getByLabel("Seats").selectOption("4");
  await page.getByLabel("Small blind").fill("25");
  await page.getByLabel("Big blind").fill("50");
  await page.getByLabel("Starting stack").fill("5000");
  await page.getByRole("button", { name: "Apply settings" }).click();

  await expect(page.locator("article").filter({ hasText: "Seat 4" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Seat 5" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Seats")).toHaveValue("4");
  await expect(page.getByLabel("Small blind")).toHaveValue("25");
  await expect(page.getByLabel("Big blind")).toHaveValue("50");
  await expect(page.getByLabel("Starting stack")).toHaveValue("5000");
});
