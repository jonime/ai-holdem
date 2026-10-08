import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import lobbyFixture from "../fixtures/turn-timer-lobby.json";
import { execFileSync } from "node:child_process";
import type { Game } from "../../components/poker/types";

async function read(page: Page, id: string): Promise<Game> {
  const response = await page.request.get(`/api/games/${id}`);
  expect(response.ok()).toBe(true); return (await response.json()).game;
}
function localSql(input: string) {
  return execFileSync("docker", ["exec","-i","supabase_db_ai-holdem","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"], { input, encoding: "utf8", timeout: 10_000 });
}
async function create(page: Page, timed = true) {
  test.skip(!!process.env.E2E_BASE_URL,"Local timer fixtures require the disposable database.");
  const token = randomUUID();
  const { humanTurnSeconds, ...untimedConfig } = lobbyFixture.config;
  const state = { ...lobbyFixture, config: { ...(timed ? { ...untimedConfig, humanTurnSeconds } : untimedConfig),
    players: lobbyFixture.config.players.map(player => ({...player,playerToken:token})) } };
  const seats = Array.from({length:6},(_,seat)=>({seat,name:seat===0?"Player 1":`Seat ${seat+1}`,controller:"human",stack:10000,
    status:seat===0?"claimed":"open",engine_player_id:seat===0?"human":null,player_token:seat===0?token:null,is_host:seat===0}));
  const literal = (value:unknown) => `'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
  const id=localSql(`set role service_role; select id from public.create_game_session(${literal(state)},1,0,'waiting','${token}',${literal(seats)});`).trim();
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  await page.context().addCookies([{name:"ai-holdem-player-id",value:token,url:String(test.info().project.use.baseURL)}]);
  await page.goto(`/game/${id}`);return id;
}
function cleanup(id: string) {
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  localSql(`begin; delete from public.actions where game_id='${id}'; delete from public.hand_card_reveals where game_id='${id}';
    delete from public.hands where game_id='${id}'; delete from public.game_players where game_id='${id}'; delete from public.games where id='${id}'; commit;`);
}
// Shorten only newly-created local fixture deadlines; there is no application override.
function shorten(id: string) {
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  localSql(`update public.games set turn_deadline=clock_timestamp()+interval '2 seconds' where id='${id}' and turn_decision_id is not null;`);
}

test("@smoke multiplayer deadlines survive reload and repeat without removing seats", async ({ page, browser }) => {
  test.skip(!!process.env.E2E_BASE_URL,"Short fixture deadlines require the local disposable database.");
  test.setTimeout(45_000);
  const id = await create(page);
  const guestContext = await browser.newContext(); const spectatorContext = await browser.newContext();
  try {
    expect((await read(page,id)).poker.humanTurnSeconds).toBe(60);
    await expect(page.getByLabel("Human turn timer")).toHaveValue("60");
    const guest = await guestContext.newPage(); await guest.goto(`/game/${id}`);
    await page.getByLabel("Human turn timer").selectOption("30");
    await expect(page.getByRole("button",{name:"Save table settings"})).toHaveCount(0);
    expect((await read(guest,id)).poker.humanTurnSeconds).toBe(60);
    let game = await read(guest,id);
    expect((await guest.request.post(`/api/games/${id}/seats/1/claim`, { data: { expectedVersion: game.version, name: "Timer guest" } })).ok()).toBe(true);
    game = await read(page,id);
    await page.getByRole("button", { name: "Start hand", exact: true }).click();
    await expect.poll(async () => (await read(page,id)).status).toBe("playing");
    game = await read(page,id);
    expect(game.poker.humanTurnSeconds).toBe(30);
    await expect(page.locator("[data-turn-countdown]")).toHaveCount(0);
    expect(game.turnTimer).not.toBeNull();
    const first = game.turnTimer!;
    const spectator = await spectatorContext.newPage(); await spectator.goto(`/game/${id}`);
    expect((await spectator.request.post(`/api/games/${id}/advance-timeout`, { data: { expectedVersion: game.version, decisionId: first.decisionId } })).status()).toBe(403);
    const early = await page.request.post(`/api/games/${id}/advance-timeout`, { data: { expectedVersion: game.version, decisionId: first.decisionId } });
    expect(early.status()).toBe(409); expect((await early.json()).code).toBe("TURN_NOT_EXPIRED");
    await page.reload();
    expect((await read(page,id)).turnTimer).toEqual(first);
    shorten(id); await page.reload(); await guest.reload();
    await expect(page.locator("[data-turn-countdown]").filter({visible:true}).first()).toHaveText(/^[0-9]+$/);
    await expect.poll(async () => (await read(page,id)).status,{timeout:12000}).toBe("complete");
    game = await read(page,id);
    expect(game.poker.players.filter(player => player.status === "claimed")).toHaveLength(2);
    expect(game.poker.players.every(player => !player.leaving)).toBe(true);
    expect(game.turnTimer).toBeNull();
    // Explicit next hand; let the small blind call, then expire a legal check.
    expect((await page.request.post(`/api/games/${id}/next-hand`,{data:{expectedVersion:game.version}})).ok()).toBe(true);
    game = await read(page,id);
    const actor = game.poker.currentActorId === "human" ? page : guest;
    expect((await actor.request.post(`/api/games/${id}/action`,{data:{expectedVersion:game.version,action:{type:"call"}}})).ok()).toBe(true);
    game = await read(page,id); const checkDecision = game.turnTimer!;
    expect(checkDecision.decisionId).not.toBe(first.decisionId);
    shorten(id); await page.reload(); await guest.reload();
    await expect.poll(async () => (await read(page,id)).poker.street,{timeout:12000}).toBe("flop");
    game = await read(page,id);
    expect(game.turnTimer?.actorEngineId).toBe(checkDecision.actorEngineId);
    expect(game.turnTimer?.decisionId).not.toBe(checkDecision.decisionId);
    expect(game.poker.players.every(player => !player.folded && !player.leaving)).toBe(true);
    const feed = await (await page.request.get(`/api/games/${id}/feed`)).json();
    expect(feed.feed.events.some((event:{type:string;action?:string}) => event.type==="action" && event.action==="check")).toBe(true);
    await page.screenshot({path:"test-results/turn-timer-multiplayer.png",fullPage:true});
  } finally { await guestContext.close(); await spectatorContext.close(); cleanup(id); }
});

test("@smoke solo custom hands and existing untimed tables have no deadlines", async ({ page }) => {
  const id = await create(page); let legacy: string | null = null;
  try {
    let game = await read(page,id);
    expect((await page.request.post(`/api/games/${id}/seats/1/assign-bot`, {data:{expectedVersion:game.version,botId:"equity-rules-v2",difficulty:"medium"}})).ok()).toBe(true);
    game = await read(page,id);
    expect((await page.request.post(`/api/games/${id}/start`,{data:{expectedVersion:game.version}})).ok()).toBe(true);
    game = await read(page,id); expect(game.turnTimer).toBeNull(); expect(game.poker.humanTurnSeconds).toBe(60);
    legacy = await create(page,false);
    game = await read(page,legacy); expect(game.poker.humanTurnSeconds).toBeNull(); expect(game.turnTimer).toBeNull();
  } finally { cleanup(id); if(legacy) cleanup(legacy); }
});

test("@smoke returning after disconnect discovers an overdue turn despite local clock skew",async({page,browser})=>{
  const id=await create(page);const guestContext=await browser.newContext();
  try{
    const guest=await guestContext.newPage();await guest.goto(`/game/${id}`);
    let game=await read(guest,id);
    expect((await guest.request.post(`/api/games/${id}/seats/1/claim`,{data:{expectedVersion:game.version,name:"Absent guest"}})).ok()).toBe(true);
    game=await read(page,id);
    expect((await page.request.post(`/api/games/${id}/start`,{data:{expectedVersion:game.version}})).ok()).toBe(true);
    const started=await read(page,id);
    await page.goto("about:blank");await guest.close();
    await page.context().setOffline(true);
    localSql(`update public.games set turn_deadline=clock_timestamp()-interval '1 second' where id='${id}';`);
    expect(Number(localSql(`select version from public.games where id='${id}';`))).toBe(started.version);
    await page.clock.setFixedTime(new Date("1999-01-01T00:00:00Z"));
    await page.context().setOffline(false);
    let attempts=0;page.on("request",request=>{if(request.url().endsWith("/advance-timeout"))attempts++;});
    await page.goto(`/game/${id}`);
    await expect.poll(async()=>(await read(page,id)).status).toBe("complete");
    game=await read(page,id);expect(game.version).toBe(started.version+1);expect(attempts).toBe(1);
    expect(game.poker.players.filter(player=>player.status==="claimed"&&!player.leaving)).toHaveLength(2);
  }finally{await page.context().setOffline(false);await guestContext.close();cleanup(id);}
});
