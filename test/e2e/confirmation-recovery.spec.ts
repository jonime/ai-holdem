import { test, expect, type Page } from "./fixtures";
import type { Game } from "../../components/poker/types";

async function create(page: Page) {
  const response = await page.request.post("/new-game", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  return new URL(response.headers().location).pathname.split("/").at(-1)!;
}
async function read(page: Page, id: string): Promise<Game> {
  const response = await page.request.get(`/api/games/${id}`);
  expect(response.ok()).toBe(true); return (await response.json()).game;
}
const dialog = (page: Page) => page.getByRole("dialog");
const submit = (page: Page) => dialog(page).getByRole("button", { name: "Delete table", exact: true });
async function openDelete(page: Page) {
  await page.goto("/play");
  await page.getByRole("button", { name: /^Delete table:/ }).click();
}

for (const missing of [false, true]) test(`@smoke Uncertain removal reconciles once without replay (${missing ? "missing" : "retained"} row)`, async ({ page }) => {
  const id = await create(page);
  await openDelete(page);
  let calls = 0, reads = 0;
  await page.route(`**/api/games/${id}/remove`, async route => {
    calls++;
    if (missing) await route.fetch();
    await route.fulfill({ json: { invalid: true } });
  });
  page.on("request", request => { if (request.url().endsWith("/api/games/mine")) reads++; });
  await submit(page).dblclick();
  await expect(dialog(page).getByRole("alert")).toContainText(missing ? "no longer in your list" : "outcome is uncertain");
  expect(calls).toBe(1); expect(reads).toBe(1);
  if (missing) await expect(submit(page)).toBeDisabled();
  else await expect(submit(page)).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath(`removal-uncertain-${missing ? "missing" : "retained"}.png`), fullPage:false });
});

test("@smoke Failed removal reconciliation blocks submission until explicit list refresh", async ({ page }) => {
  const id = await create(page); await openDelete(page);
  let calls = 0;
  await page.route(`**/api/games/${id}/remove`, route => { calls++; return route.abort("failed"); });
  await page.route("**/api/games/mine", route => route.abort("failed"));
  await submit(page).click();
  await expect(dialog(page).getByRole("alert")).toContainText("list could not be refreshed");
  await expect(submit(page)).toBeDisabled();
  await page.screenshot({ path:test.info().outputPath("removal-refresh-required.png"), fullPage:false });
  await page.unroute("**/api/games/mine");
  await dialog(page).getByRole("button", { name: "Refresh list" }).click();
  await expect(submit(page)).toBeEnabled(); expect(calls).toBe(1);
});

test("@smoke Conflicting removal keeps the intended operation until closing and reopening", async ({ page }) => {
  const id = await create(page); await openDelete(page);
  const rows = await (await page.request.get("/api/games/mine")).json();
  rows.games[0].removal = "remove_from_list"; rows.games[0].version++;
  let calls = 0;
  await page.route("**/api/games/mine", route => route.fulfill({ json: rows }));
  await page.route(`**/api/games/${id}/remove`, route => { calls++; return route.fulfill({ status:409,json:{error:"Changed",code:"GAME_VERSION_CONFLICT"} }); });
  await submit(page).click();
  await expect(dialog(page).getByRole("alert")).toContainText("available action changed");
  await expect(submit(page)).toBeDisabled();
  await page.screenshot({ path:test.info().outputPath("removal-operation-changed.png"),fullPage:false });
  await dialog(page).getByRole("button", { name:"Cancel" }).click();
  await page.getByRole("button", { name:/^Remove from my tables:/ }).click();
  await expect(dialog(page).getByRole("heading")).toHaveText("Remove from my tables"); expect(calls).toBe(1);
});

test("@smoke Acknowledged deletion followed by list failure stays successful and restores heading focus", async ({ page }) => {
  const id = await create(page); await openDelete(page);
  await page.route("**/api/games/mine", route => route.abort("failed"));
  await submit(page).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name:"Play",exact:true })).toBeFocused();
  await expect(page.locator("main").getByRole("alert")).toContainText("Your tables could not be loaded");
  expect((await page.request.get(`/api/games/${id}`)).status()).toBe(404);
  await expect(page.getByText("The table could not be removed.")).toHaveCount(0);
});

async function twoHumans(page: Page, guest: Page) {
  const id = await create(page);
  await guest.request.get(`/api/games/${id}`);
  const state = await read(page,id);
  expect((await guest.request.post(`/api/games/${id}/seats/1/claim`, { data:{expectedVersion:state.version,name:"Guest"} })).ok()).toBe(true);
  await page.goto(`/game/${id}`);
  await page.getByRole("button", { name:"Leave table",exact:true }).click();
  return id;
}

test("@smoke Departure dialog follows multiplayer phase and eligibility changes without stacking or navigation", async ({ page,browser }) => {
  const context = await browser.newContext();
  try {
    const guest = await context.newPage(); const id = await twoHumans(page,guest);
    const before = await read(page,id);
    expect((await page.request.post(`/api/games/${id}/start`, { data:{expectedVersion:before.version} })).ok()).toBe(true);
    await expect(dialog(page)).toContainText("All-in players keep their eligibility");
    await expect(dialog(page)).toHaveCount(1);
    await page.keyboard.press("a"); await expect(dialog(page)).toHaveCount(1);
    await page.screenshot({ path:test.info().outputPath("leave-table-live-update.png"),fullPage:false });
    const active = await read(page,id);
    expect((await page.request.post(`/api/games/${id}/action`, { data:{expectedVersion:active.version,action:{type:"fold"}} })).ok()).toBe(true);
    await expect(dialog(page)).toContainText("your hand results will remain available");
    await page.screenshot({path:test.info().outputPath("leave-table-complete.png"),fullPage:false});
    const completed = await read(page,id);
    expect((await guest.request.post(`/api/games/${id}/seats/1/release`, { data:{expectedVersion:completed.version} })).ok()).toBe(true);
    await expect(dialog(page)).toContainText("You no longer need to leave this seat");
    await expect(dialog(page).getByRole("button", { name:"Leave table",exact:true })).toBeDisabled();
    await expect(dialog(page).getByRole("link", { name:"Lobby",exact:true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/game/${id}$`));
    await page.screenshot({ path:test.info().outputPath("leave-table-eligibility-changed.png"),fullPage:false });
  } finally { await context.close(); }
});

test("@smoke Uncertain acknowledged departure offers Lobby without replaying or automatic navigation", async ({ page,browser }) => {
  const context = await browser.newContext();
  try {
    const id = await twoHumans(page,await context.newPage()); let calls=0;
    await page.route(`**/api/games/${id}/seats/0/release`, async route => {
      calls++; await route.fetch(); await route.fulfill({ json:{invalid:true} });
    });
    await dialog(page).getByRole("button", { name:"Leave table",exact:true }).click();
    await expect(dialog(page)).toContainText("Your departure is already registered or your seat has been released");
    await expect(page).toHaveURL(new RegExp(`/game/${id}$`)); expect(calls).toBe(1);
    await page.screenshot({ path:test.info().outputPath("leave-table-reconciled.png"),fullPage:false });
    await dialog(page).getByRole("link", { name:"Lobby",exact:true }).click();
    await expect(page).toHaveURL(/\/play$/);
  } finally { await context.close(); }
});

test("@smoke Confirmation traps focus, restores cancellation, and fences a removal response after navigation", async ({ page }) => {
  const id = await create(page); await openDelete(page);
  const cancel = dialog(page).getByRole("button", { name:"Cancel" });
  await expect(cancel).toBeFocused();
  for (let index=0; index<8; index++) {
    await page.keyboard.press(index<4 ? "Tab" : "Shift+Tab");
    expect(await dialog(page).evaluate(element => element.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  }
  await page.mouse.click(2,2); await expect(dialog(page)).toHaveCount(0);
  const trigger = page.getByRole("button", { name:/^Delete table:/ });
  await expect(trigger).toBeFocused(); await trigger.click();
  let finish!: () => void; const gate = new Promise<void>(resolve => { finish=resolve; });
  let calls=0;
  await page.route(`**/api/games/${id}/remove`, async route => {
    calls++; await gate; await route.fulfill({json:{version:1}}).catch(() => {});
  });
  await submit(page).click();
  await page.mouse.click(2,2); await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeVisible();
  await expect(cancel).toBeDisabled(); expect(calls).toBe(1);
  await page.goto("/"); finish();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("@smoke Stale removal refreshes the expected version and waits for a new explicit decision", async ({ page }) => {
  const id=await create(page); await openDelete(page);
  const rows=await (await page.request.get("/api/games/mine")).json();
  const original=rows.games[0].version; rows.games[0].version++;
  await page.route("**/api/games/mine",route=>route.fulfill({json:rows}));
  const versions:number[]=[];
  await page.route(`**/api/games/${id}/remove`,route=>{
    versions.push(route.request().postDataJSON().expectedVersion);
    return route.fulfill({status:409,json:{error:"Changed",code:"GAME_VERSION_CONFLICT"}});
  });
  await submit(page).click();
  await expect(dialog(page).getByRole("alert")).toContainText("The table changed");
  expect(versions).toEqual([original]);
  await submit(page).click();
  await expect.poll(()=>versions).toEqual([original,original+1]);
});

test("@smoke Uncertain departure keeps recovery inside its dialog until an explicit refresh", async ({ page,browser }) => {
  const context=await browser.newContext();
  try {
    const id=await twoHumans(page,await context.newPage()); let calls=0;
    await page.route(`**/api/games/${id}`,route=>route.abort("failed"));
    await page.route(`**/api/games/${id}/seats/0/release`,route=>{calls++;return route.abort("failed");});
    await dialog(page).getByRole("button",{name:"Leave table",exact:true}).click();
    await expect(dialog(page).getByRole("alert")).toContainText("couldn’t confirm your action or refresh the table");
    await expect(page.getByRole("button",{name:"Refresh table",exact:true})).toHaveCount(1);
    await expect(dialog(page).getByRole("button",{name:"Leave table",exact:true})).toBeDisabled();
    await page.screenshot({path:test.info().outputPath("leave-table-refresh-required.png"),fullPage:false});
    await page.unroute(`**/api/games/${id}`);
    await dialog(page).getByRole("button",{name:"Refresh table",exact:true}).click();
    await expect(dialog(page).getByRole("button",{name:"Leave table",exact:true})).toBeEnabled();
    expect(calls).toBe(1);
  } finally { await context.close(); }
});
