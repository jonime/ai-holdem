import { expect, test, type Page } from "@playwright/test";

async function waitForPlayableHuman(page: Page) {
  await expect(page.getByText("Your legal actions")).toBeVisible({
    timeout: 10_000,
  });
  return page.getByRole("button", { name: /Call/ });
}

test("runs a two-player hand in a six-seat lobby", async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByLabel("Seats").selectOption("6");
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/games") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "New Game" }).click();
  const createResponse = await createResponsePromise;
  const createBody = await createResponse.text();
  expect(createResponse.ok(), createBody).toBe(true);
  await expect(page).toHaveURL(/\/game\/[0-9a-f-]+$/);
  const gameUrl = page.url();

  await expect(page.getByText("WAITING ROOM")).toBeVisible();
  await expect(page.getByText("SEAT 6")).toBeVisible();
  await expect(page.getByText("Available").first()).toBeVisible();

  const secondBrowser = await browser.newContext();
  const secondPage = await secondBrowser.newPage();
  await secondPage.goto(gameUrl);
  await expect(secondPage.getByText("WAITING ROOM")).toBeVisible();
  await secondPage.getByRole("button", { name: "Sit here" }).first().click();
  await expect(secondPage.getByText("Human")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Human")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start hand" })).toBeEnabled();
  await page.getByRole("button", { name: "Start hand" }).click();

  await expect(page.getByText("PREFLOP")).toBeVisible();
  await expect(page.getByText("PLAYER 6")).toHaveCount(1);
  await expect(page.getByText("Waiting for next hand")).toHaveCount(4);

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
