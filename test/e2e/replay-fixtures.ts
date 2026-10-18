import { createUITable } from "./ui-fixtures";
import { expect, type Browser, type Page } from "./fixtures";
import type { Game } from "../../components/poker/types";
export async function completed(browser: Browser, page: Page) {
  await page.goto("/play");
  const id = await createUITable(page);
  const read = async (p = page): Promise<Game> => (await (await p.request.get(`/api/games/${id}`)).json()).game;
  const patch = await page.request.patch(`/api/games/${id}/seat-count`, { data: { expectedVersion: (await read()).version, seatCount: 2 } });
  expect(patch.ok()).toBe(true);
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/game/${id}`);
  await guest.getByRole("textbox", { name: "Your name" }).fill("Guest");
  await guest.getByRole("button", { name: "Sit here" }).click();
  await expect(guest.getByText("You’re seated. Waiting for the host to start.")).toBeVisible();
  expect((await page.request.post(`/api/games/${id}/start`, { data: { expectedVersion: (await read()).version } })).ok()).toBe(true);
  const start = await read();
  const ownerId = start.poker.players.find(p => p.playerToken !== null)!.id;
  const actorPage = start.poker.currentActorId === ownerId ? page : guest;
  expect((await actorPage.request.post(`/api/games/${id}/action`, { data: { expectedVersion: start.version, action: { type: "fold" } } })).ok()).toBe(true);
  await page.goto(`/game/${id}`);
  await expect(page.locator("[data-hand-result]")).toBeVisible();
  await expect(page.locator("[data-hand-result]").getByRole("button", { name: "Review hand" })).toHaveCount(0);
  return { id, guestContext, guest, read, ownerId };
}
