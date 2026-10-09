import { expect, test } from "@playwright/test";
import type { Game } from "../../components/poker/types";
import { createUITable } from "./ui-fixtures";

test("uses the selected app locale for lobby chips and preserves numeric controls", { tag: "@ui-regression" }, async ({ browser }) => {
  const ownerContext = await browser.newContext({ locale: "en-US" });
  const guestContext = await browser.newContext({ locale: "en-US" });
  try {
    const owner = await ownerContext.newPage();
    await owner.goto("/play");
    const gameId = await createUITable(owner);
    const response = await owner.request.get(`/api/games/${gameId}`);
    expect(response.ok()).toBe(true);
    const { game } = await response.json() as { game: Game };
    const settings = await owner.request.patch(`/api/games/${gameId}/settings`, {
      data: { expectedVersion: game.version, seatCount: 2, smallBlind: 1000, bigBlind: 2000, startingStack: 10000, botsShowUncontestedWins: false },
    });
    expect(settings.ok()).toBe(true);
    await owner.goto(`/fi-FI/game/${gameId}`);
    expect(await owner.evaluate(() => navigator.language)).toBe("en-US");
    const smallBlind = owner.getByRole("spinbutton", { name: "Pieni blindi", exact: true });
    const bigBlind = owner.getByRole("spinbutton", { name: "Iso blindi", exact: true });
    const startingStack = owner.getByRole("spinbutton", { name: /^Aloituspino/ });
    await expect(smallBlind).toHaveValue("1000");
    await expect(bigBlind).toHaveValue("2000");
    await expect(startingStack).toHaveValue("10000");

    const guest = await guestContext.newPage();
    await guest.goto(owner.url());
    const summary = guest.getByLabel("Pöydän asetukset");
    // Exact text content retains Finnish non-breaking spaces, unlike locator whitespace normalization.
    await expect(summary.locator("strong")).toHaveCount(4);
    expect(await summary.locator("strong").allTextContents()).toEqual([
      "2", "1\u00a0000 / 2\u00a0000", "60 sekuntia", "10\u00a0000",
    ]);
    await guest.getByRole("button", { name: "Istu tähän", exact: true }).first().click();
    await smallBlind.fill("1500");
    await bigBlind.fill("3000");
    await startingStack.fill("12000");
    const startResponse = owner.waitForResponse(r => r.url().endsWith("/start") && r.request().method() === "POST");
    await owner.getByRole("button", { name: "Aloita käsi", exact: true }).click();
    const started = await startResponse;
    expect(started.ok()).toBe(true);
    const { game: startedGame } = await started.json() as { game: Game };
    expect(startedGame.poker).toMatchObject({ smallBlind: 1500, bigBlind: 3000, startingStack: 12000 });
    await expect(owner.getByText("Enne floppia", { exact: true })).toBeVisible();
  } finally {
    await guestContext.close();
    await ownerContext.close();
  }
});
