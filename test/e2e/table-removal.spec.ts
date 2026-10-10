import { expect, test, type Page } from "@playwright/test";
import type { Game } from "../../components/poker/types";
async function read(page: Page, id: string): Promise<Game> {
  const response = await page.request.get(`/api/games/${id}`);
  expect(response.ok()).toBe(true); return (await response.json()).game;
}
async function create(page: Page) {
  const response = await page.request.post("/new-game", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const url = response.headers().location;
  return new URL(url).pathname.split("/").at(-1)!;
}
async function claim(page: Page, id: string, seat = 1) {
  await page.goto(`/game/${id}`);
  const response = await page.request.post(`/api/games/${id}/seats/${seat}/claim`, { data: { expectedVersion: (await read(page,id)).version, name: "Removal guest" } });
  expect(response.ok()).toBe(true);
}
const personal = (page: Page) => page.getByRole("region", { name: "Your tables" });

test("@smoke Hosted deletion blocks other humans, cancellation preserves history, and last-human Leave works", async ({ page, browser }) => {
  const id = await create(page);
  await page.goto(`/game/${id}`);
  await expect(page.getByRole("button", { name: "Leave table", exact: true })).toBeVisible();
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("button", { name: "Leave table", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  expect((await read(page,id)).poker.players[0].status).toBe("open");
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage(); await claim(guest,id);
    await page.goto("/play");
    const button = personal(page).getByRole("button", { name: /^Delete table:/ });
    const hide = personal(page).getByRole("button", { name: /^Remove from my tables:/ });
    await expect(hide).toBeEnabled();
    page.once("dialog", dialog => { expect(dialog.message()).toContain("history remain available to other players"); return dialog.dismiss(); });
    await hide.click();
    await expect(hide).toBeEnabled();
    page.once("dialog", dialog => dialog.accept());
    await hide.click();
    await expect(personal(page)).toHaveCount(0);
    expect((await read(guest,id)).poker.players.find(p => p.seat === 1)?.status).toBe("claimed");
    await page.goto(`/game/${id}`); await page.goto("/play");
    await expect(personal(page)).toHaveCount(0);
    // Reclaiming restores the hidden hosted table; deletion stays protected.
    await claim(page,id,0); await page.goto("/play");
    await expect(hide).toBeEnabled();
    await guest.goto("/play");
    guest.once("dialog", dialog => { expect(dialog.message()).toContain("irreversible during a hand"); return dialog.accept(); });
    await personal(guest).getByRole("button", { name: /^Leave and remove:/ }).click();
    await expect(personal(guest)).toHaveCount(0);
    await page.reload(); await expect(button).toBeEnabled();
    let calls = 0; page.on("request", request => { if (request.url().endsWith("/remove")) calls++; });
    page.once("dialog", dialog => { expect(dialog.message()).toContain("history and shared URL will be permanently removed"); expect(dialog.message()).toContain(id.slice(0,8)); return dialog.dismiss(); });
    await button.click(); expect(calls).toBe(0); await expect(button).toBeEnabled();
    await expect(personal(page).getByRole("link", { name: /^Return to table:/ })).toHaveCount(1);
    page.once("dialog", dialog => dialog.accept()); await button.press("Enter");
    await expect(personal(page)).toHaveCount(0); expect(calls).toBe(1);
    expect((await page.request.get(`/api/games/${id}`)).status()).toBe(404);
  } finally { await guestContext.close(); }
});

test("@smoke Joined removal refills five rows, restores only on a new claim, and supports mobile controls", async ({ page, browser }, testInfo) => {
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage(); const target=await create(page); await claim(guest,target);
    const ids=Array.from({ length:5 },(_,i)=>`11111111-1111-4111-8111-11111111111${i}`);
    const older=ids.map(gameId=>({ gameId,title:`Older table ${gameId}`,status:"waiting",version:0,removal:"leave_and_remove",updatedAt:"2026-10-06T12:00:00Z",occupiedSeats:2,totalSeats:6 }));
    await guest.setViewportSize({ width:390,height:844 }); await guest.goto("/play");
    await expect(personal(guest).getByRole("link")).toHaveCount(1);
    // SQL verifies exclusion-before-limit ordering; here verify UI consumes the refill.
    await guest.route("**/api/games/mine",route=>route.fulfill({ json:{ games:older } }));
    const remove = personal(guest).getByRole("button", { name: new RegExp(`^Leave and remove:.*${target.slice(0,8)}`) });
    const box=await remove.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
    let calls=0; guest.on("request", request => { if (request.url().endsWith(`/${target}/remove`)) calls++; });
    let release!: () => void; const gate=new Promise<void>(resolve => { release=resolve; });
    await guest.route(`**/api/games/${target}/remove`, async route => { await gate; await route.continue(); });
    guest.once("dialog",dialog => dialog.accept()); await remove.press("Enter");
    await expect(remove).toBeDisabled(); expect(calls).toBe(1); release();
    await expect(personal(guest).getByRole("link", { name: new RegExp(target.slice(0,8)) })).toHaveCount(0);
    await expect(personal(guest).getByRole("link")).toHaveCount(5);
    await expect(personal(guest).getByRole("link", { name: new RegExp(ids[0]) })).toBeVisible();
    expect(await guest.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await guest.screenshot({ path:testInfo.outputPath("removal-mobile.png"),fullPage:true });
    await guest.goto(`/game/${target}`); await guest.goto("/play");
    await expect(personal(guest).getByRole("link", { name:new RegExp(target.slice(0,8)) })).toHaveCount(0);
    await guest.unroute("**/api/games/mine");
    await claim(guest,target); await guest.goto("/play");
    await expect(personal(guest).getByRole("link", { name:new RegExp(target.slice(0,8)) })).toBeVisible();
  } finally { await guestContext.close(); }
});

test("@smoke Removal conflicts require explicit retry and failures retain rows", async ({ page }) => {
  const id=await create(page); await page.goto("/play");
  const button=personal(page).getByRole("button", { name:/^Delete table:/ });
  let calls=0;
  await page.route(`**/api/games/${id}/remove`, route => { calls++; return route.fulfill({ status:409,json:{ error:"Game changed",code:"GAME_CONFLICT" } }); });
  page.once("dialog",dialog=>dialog.accept()); await button.click();
  await expect(personal(page).getByRole("alert")).toContainText("The table changed.");
  await expect(button).toBeEnabled(); expect(calls).toBe(1);
  await page.route(`**/api/games/${id}/remove`,route=>route.fulfill({ status:500,json:{ error:"Failed" } }));
  page.once("dialog",dialog=>dialog.accept()); await button.click();
  await expect(personal(page).getByRole("alert")).toContainText("The table could not be removed.");
  await expect(personal(page).getByRole("link")).toHaveCount(1);
});

for (const polling of [false,true]) test(`@smoke Deleted-table recovery through ${polling ? "polling with blocked WebSockets" : "two-browser Realtime"}`, async ({ page,browser }) => {
  const id=await create(page); const observerContext=await browser.newContext();
  try {
    const observer=await observerContext.newPage();
    let subscribed=false;
    const notifications: unknown[]=[];
    observer.on("websocket",socket=>socket.on("framereceived",({ payload })=>{
      try {
        const frame=JSON.parse(String(payload));
        const event=Array.isArray(frame)?frame[3]:frame.event;
        const body=Array.isArray(frame)?frame[4]:frame.payload;
        const topic=Array.isArray(frame)?frame[2]:frame.topic;
        if (topic?.startsWith("realtime:game:") && event==="phx_reply" && body.status==="ok") subscribed=true;
        if (event==="broadcast") notifications.push(body.payload);
      } catch { /* Ignore transport control frames. */ }
    }));
    if (polling) await observer.routeWebSocket(/\/realtime\//,socket=>socket.close());
    await observer.goto(`/game/${id}`); await expect(observer.getByText("Waiting room", { exact:true })).toBeVisible();
    if (!polling) {
      await expect.poll(()=>subscribed).toBe(true);
      await observer.clock.install();
      // The installed clock keeps advancing; pause ahead of its current time.
      await observer.clock.pauseAt(await observer.evaluate(() => Date.now() + 1_000));
    }
    let steps=0; observer.on("request", request=>{ if (/\/(step|advance-departure)$/.test(request.url())) steps++; });
    await page.goto("/play"); page.once("dialog",dialog=>dialog.accept());
    await personal(page).getByRole("button", { name:/^Delete table:/ }).click();
    if (!polling) {
      await expect.poll(()=>notifications,{ timeout:4000 }).toContainEqual({ type:"seat_released",gameId:id });
      await observer.clock.runFor(100);
    }
    await expect(observer.locator("main").getByRole("alert")).toContainText("This table is no longer available.",{ timeout:20_000 });
    await expect(observer.getByText("Waiting room", { exact:true })).toHaveCount(0);
    expect(steps).toBe(0);
    await observer.getByRole("link", { name:"Lobby",exact:true }).click(); await expect(observer).toHaveURL(/\/play$/);
  } finally { await observerContext.close(); }
});

test("@smoke Joined active-hand removal registers departure before hiding the row", async ({ page,browser }) => {
  const id=await create(page); const guestContext=await browser.newContext();
  try {
    const guest=await guestContext.newPage(); await claim(guest,id);
    const before=await read(page,id);
    expect((await page.request.post(`/api/games/${id}/start`,{ data:{ expectedVersion:before.version } })).ok()).toBe(true);
    const active=await read(page,id); expect(active.status).toBe("playing");
    await guest.goto("/play");
    guest.once("dialog",dialog=>{ expect(dialog.message()).toContain("active seats fold on their next legal turn"); return dialog.accept(); });
    await personal(guest).getByRole("button",{ name:/^Leave and remove:/ }).click();
    await expect(personal(guest)).toHaveCount(0);
    const departed=await read(page,id);
    const seat=(departed.poker.seats??departed.poker.players).find(s=>s.seat===1)!;
    expect(seat.leaving || seat.status==="open").toBe(true);
    expect(departed.version).toBeGreaterThan(active.version);
    await guest.goto(`/game/${id}`); await guest.goto("/play");
    await expect(personal(guest)).toHaveCount(0);
  } finally { await guestContext.close(); }
});

for (const completed of [false, true]) test(`@smoke Host personal removal preserves guests and history (${completed ? "completed unseated" : "active seated"})`, async ({ page, browser }) => {
  const id = await create(page);
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage(); await claim(guest, id);
    const waiting = await read(page, id);
    expect((await page.request.post(`/api/games/${id}/start`, { data: { expectedVersion: waiting.version } })).ok()).toBe(true);
    if (completed) {
      const active = await read(page, id);
      const actorSeat = active.poker.players.find(p => p.id === active.poker.currentActorId)!.seat;
      const actor = actorSeat === 0 ? page : guest;
      expect((await actor.request.post(`/api/games/${id}/action`, { data: { expectedVersion: active.version, action: { type: "fold" } } })).ok()).toBe(true);
      const complete = await read(page, id); expect(complete.status).toBe("complete");
      expect((await page.request.post(`/api/games/${id}/seats/0/release`, { data: { expectedVersion: complete.version } })).ok()).toBe(true);
    }
    const before = await read(page, id);
    const feed = await (await guest.request.get(`/api/games/${id}/feed`)).json();
    await page.goto("/play"); page.once("dialog", dialog => dialog.accept());
    await personal(page).getByRole("button", { name: /^Remove from my tables:/ }).click();
    await expect(personal(page)).toHaveCount(0);
    const after = await read(guest, id);
    expect(after.poker.seats!.find(s => s.seat === 1)?.status).toBe("claimed");
    if (completed) {
      expect(after.version).toBe(before.version);
      expect(await (await guest.request.get(`/api/games/${id}/feed`)).json()).toEqual(feed);
    } else {
      const host = after.poker.seats!.find(s => s.seat === 0)!;
      expect(host.leaving || host.status === "open").toBe(true);
      expect(after.version).toBeGreaterThan(before.version);
    }
    await guest.goto("/play");
    await expect(personal(guest).getByRole("link", { name: new RegExp(id.slice(0, 8)) })).toBeVisible();
    await page.goto(`/game/${id}`); await page.goto("/play");
    await expect(personal(page)).toHaveCount(0);
  } finally { await guestContext.close(); }
});
