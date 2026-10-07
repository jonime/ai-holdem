import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { AIDecision, Game } from "../../components/poker/types";

const gameplayDecision: AIDecision = {
  action: "check", amount: null,
  bot: { id: "rules", label: "Rules", provider: "rules", modelId: null },
  botProfileId: null, probabilities: null, confidence: null, sizing: null, matchedRule: null,
};

async function fixture(page: Page) {
  const response = await page.request.post("/quick-game", { headers: { Accept: "application/json" } });
  expect(response.status()).toBe(201);
  const { gameId } = await response.json();
  const original: Game = (await (await page.request.get(`/api/games/${gameId}`)).json()).game;
  const bot = original.poker.players.find(p => p.controller === "bot")!;
  let game: Game = { ...original, version: original.version + 100,
    poker: { ...original.poker, currentActorId: bot.id, street: "flop" } };
  await page.route(`**/api/games/${gameId}`, route => route.fulfill({ json: { game } }));
  return { gameId, current: () => game, set: (next: Game) => { game = next; } };
}

async function open(page: Page, gameId: string) {
  await page.goto(`/game/${gameId}`);
  await expect(page.getByRole("complementary", { name: "Actions", exact: true })).toBeVisible();
}

async function triggerRefresh(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

function humanTurn(game: Game): Game {
  return { ...game, version: game.version + 1, poker: { ...game.poker,
    currentActorId: game.poker.players.find(p => p.controller === "human")!.id } };
}

async function shareIdentity(source: BrowserContext, target: BrowserContext) {
  await target.addCookies(await source.cookies());
}

test("separate spectator identity stays passive on load, polling, refresh, and completion; API forbids steps", async ({ page, browser }) => {
  const f = await fixture(page);
  const spectatorContext = await browser.newContext();
  const spectator = await spectatorContext.newPage();
  let steps = 0;
  let reads = 0;
  let sendUpdate: (() => void) | undefined;
  await spectator.clock.install();
  await spectator.routeWebSocket(/\/realtime\/v1\/websocket/, socket => {
    socket.onMessage(message => {
      if (typeof message !== "string") return;
      const [joinRef, ref, topic, event] = JSON.parse(message);
      if (event === "phx_join" || event === "heartbeat") {
        socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: [] } }]));
      }
      if (event === "phx_join") {
        sendUpdate = () => socket.send(JSON.stringify([joinRef, null, topic, "broadcast", {
          type: "broadcast", event: "game_updated", payload: {
            type: "game_updated", gameId: f.gameId, version: f.current().version,
            game: { ...masked(), publication: null, poker: { ...masked().poker, legalActions: [] } },
          },
        }]));
      }
    });
  });
  spectator.on("request", request => { if (request.url().endsWith("/step")) steps++; });
  const masked = () => ({ ...f.current(), viewerIsHost: false, poker: { ...f.current().poker,
    players: f.current().poker.players.map(p => ({ ...p, playerToken: null, holeCards: null })) } });
  await spectator.route(`**/api/games/${f.gameId}`, route => {
    reads++;
    return route.fulfill({ json: { game: masked() } });
  });
  await open(spectator, f.gameId);
  await expect.poll(() => Boolean(sendUpdate)).toBe(true);
  const beforeBroadcast = reads;
  f.set({ ...f.current(), version: f.current().version + 1 });
  sendUpdate!();
  await spectator.clock.fastForward(250);
  await expect.poll(() => reads).toBeGreaterThan(beforeBroadcast);
  const beforePolling = reads;
  await spectator.clock.fastForward(31_000);
  await expect.poll(() => reads).toBeGreaterThan(beforePolling);
  expect(steps).toBe(0);
  f.set({ ...f.current(), version: f.current().version + 1, status: "complete",
    poker: { ...f.current().poker, street: "complete", currentActorId: null } });
  await triggerRefresh(spectator);
  await expect(spectator.getByRole("button", { name: "Retry bot", exact: true })).toHaveCount(0);
  expect(steps).toBe(0);
  const response = await spectator.request.post(`/api/games/${f.gameId}/step`, { data: { expectedVersion: 0 } });
  expect(response.status()).toBe(403);
  await spectatorContext.addCookies([{ name: "ai-holdem-player-id", value: "spectator-test", url: new URL(spectator.url()).origin }]);
  expect((await spectator.request.post(`/api/games/${f.gameId}/step`, { data: { expectedVersion: 0 } })).status()).toBe(403);
  await spectatorContext.close();
});

test("two authorized browsers race, loser refreshes silently and continues", async ({ page, browser }) => {
  const f = await fixture(page);
  const otherContext = await browser.newContext();
  await shareIdentity(page.context(), otherContext);
  const other = await otherContext.newPage();
  await other.route(`**/api/games/${f.gameId}`, route => route.fulfill({ json: { game: f.current() } }));
  let arrivals = 0;
  let commits = 0;
  let release!: () => void;
  const both = new Promise<void>(resolve => { release = resolve; });
  const handle = async (route: import("@playwright/test").Route) => {
    const expected = route.request().postDataJSON().expectedVersion;
    arrivals++;
    if (arrivals === 2) release();
    await both;
    if (expected !== f.current().version) {
      await route.fulfill({ status: 409, json: { error: "Game version conflict", code: "GAME_VERSION_CONFLICT" } });
    } else {
      commits++;
      f.set(humanTurn(f.current()));
      await route.fulfill({ json: { game: f.current(), aiDecision: gameplayDecision } });
    }
  };
  await page.route(`**/api/games/${f.gameId}/step`, handle);
  await other.route(`**/api/games/${f.gameId}/step`, handle);
  await Promise.all([open(page, f.gameId), open(other, f.gameId)]);
  await expect.poll(() => arrivals).toBe(2);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect(other.locator("main").getByRole("alert")).toHaveCount(0);
  expect(commits).toBe(1);
  f.set({ ...f.current(), version: f.current().version + 1,
    poker: { ...f.current().poker, currentActorId: f.current().poker.players.find(p => p.controller === "bot")!.id } });
  await triggerRefresh(other);
  await expect.poll(() => commits).toBe(2);
  await otherContext.close();
});

test("provider failures allow retry, conflict refresh failures are visible, completion stays manual", async ({ page }) => {
  const f = await fixture(page);
  let steps = 0;
  let nextHands = 0;
  page.on("request", r => { if (r.url().endsWith("/next-hand")) nextHands++; });
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    if (steps === 1) await route.fulfill({ status: 502, json: { error: "AI decision failed" } });
    else if (steps === 2) {
      await page.route(`**/api/games/${f.gameId}`, r => r.fulfill({ status: 500, json: { error: "Refresh failed" } }));
      await route.fulfill({ status: 409, json: { error: "Game version conflict", code: "GAME_VERSION_CONFLICT" } });
    } else {
      f.set({ ...f.current(), version: f.current().version + 1, status: "complete",
        poker: { ...f.current().poker, street: "complete", currentActorId: null } });
      await route.fulfill({ json: { game: f.current(), aiDecision: gameplayDecision } });
    }
  });
  await open(page, f.gameId);
  await expect(page.locator("main").getByRole("alert")).toContainText("AI decision failed");
  await page.getByRole("button", { name: /Retry/ }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Refresh failed");
  await page.route(`**/api/games/${f.gameId}`, r => r.fulfill({ json: { game: f.current() } }));
  await page.getByRole("button", { name: /Retry/ }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect.poll(() => steps).toBe(3);
  expect(nextHands).toBe(0);
});

test("navigation discards a pending bot response and stops the old loop", async ({ page }) => {
  const f = await fixture(page);
  let steps = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    await held;
    await route.fulfill({ json: { game: { ...f.current(), version: f.current().version + 1 }, aiDecision: gameplayDecision } }).catch(() => undefined);
  });
  await open(page, f.gameId);
  await expect.poll(() => steps).toBe(1);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Exit", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(f.gameId));
  release();
  await page.waitForTimeout(300);
  expect(steps).toBe(1);
});


test("advancement following a human action uses silent conflict recovery", async ({ page }) => {
  const f = await fixture(page);
  f.set({ ...humanTurn(f.current()), poker: { ...humanTurn(f.current()).poker, legalActions: [{ type: "check" }] } });
  let steps = 0;
  await page.route(`**/api/games/${f.gameId}/action`, async route => {
    f.set({ ...f.current(), version: f.current().version + 1, poker: { ...f.current().poker,
      currentActorId: f.current().poker.players.find(p => p.controller === "bot")!.id } });
    await route.fulfill({ json: { game: f.current() } });
  });
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    f.set(humanTurn(f.current()));
    await route.fulfill({ status: 409, json: { error: "Game version conflict", code: "GAME_VERSION_CONFLICT" } });
  });
  await open(page, f.gameId);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect.poll(() => steps).toBe(1);
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeEnabled();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("loss of eligibility discards a pending response and stops subsequent steps", async ({ page }) => {
  const f = await fixture(page);
  let steps = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    const stale = f.current();
    await held;
    await route.fulfill({ json: { game: { ...stale, version: stale.version + 1 }, aiDecision: gameplayDecision } });
  });
  await open(page, f.gameId);
  await expect.poll(() => steps).toBe(1);
  f.set({ ...f.current(), viewerIsHost: false, version: f.current().version + 1,
    poker: { ...f.current().poker, players: f.current().poker.players.map(p => ({ ...p, playerToken: null, holeCards: null })) } });
  const refreshed = page.waitForResponse(r => r.url().endsWith(`/api/games/${f.gameId}`));
  await triggerRefresh(page);
  await refreshed;
  release();
  await page.waitForTimeout(300);
  expect(steps).toBe(1);
  await expect(page.getByRole("button", { name: "Retry bot", exact: true })).toHaveCount(0);
});

for (const failure of [
  { name: "malformed successful response", status: 200, body: { game: {}, aiDecision: {} }, message: "Invalid response payload" },
  { name: "unrelated conflict", status: 409, body: { error: "It is not a bot turn" }, message: "It is not a bot turn" },
  { name: "conflict without a code", status: 409, body: { error: "Game version conflict" }, message: "Game version conflict" },
]) {
  test(`${failure.name} remains visible and stops the bot loop`, async ({ page }) => {
    const f = await fixture(page);
    let steps = 0;
    await page.route(`**/api/games/${f.gameId}/step`, async route => {
      steps++;
      await route.fulfill({ status: failure.status, json: failure.body });
    });
    await open(page, f.gameId);
    await expect(page.locator("main").getByRole("alert")).toContainText(failure.message);
    expect(steps).toBe(1);
    await expect(page.getByRole("button", { name: /Retry/ })).toBeVisible();
  });
}

for (const failure of [
  { code: "BOT_TIMEOUT", message: "The bot request timed out." },
  { code: "BOT_NETWORK_ERROR", message: "The bot could not connect to its provider." },
  { code: "BOT_RATE_LIMITED", message: "The bot provider is rate limiting requests." },
  { code: "BOT_INVALID_RESPONSE", message: "The bot provider returned an invalid response." },
  { code: "BOT_PROVIDER_ERROR", message: "The bot provider failed." },
]) {
  test(`${failure.code} pauses polling and one explicit retry uses fresh state`, async ({ page }) => {
    const f = await fixture(page);
    await page.clock.install();
    let steps = 0;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/games/${f.gameId}/step`, async route => {
      steps++;
      if (steps === 1) {
        await route.fulfill({ status: 502, json: { error: "AI decision failed", code: failure.code } });
        return;
      }
      expect(route.request().postDataJSON().expectedVersion).toBe(f.current().version);
      await held;
      f.set(humanTurn(f.current()));
      await route.fulfill({ json: { game: f.current(), aiDecision: gameplayDecision } });
    });
    await open(page, f.gameId);
    await expect(page.locator("main").getByRole("alert")).toContainText(failure.message);
    await expect(page.locator("main").getByRole("alert")).toContainText("Play is paused");
    await page.clock.fastForward(31_000);
    await triggerRefresh(page);
    expect(steps).toBe(1);
    // A new authoritative version on the same turn still needs explicit retry.
    f.set({ ...f.current(), version: f.current().version + 1 });
    const refresh = page.waitForResponse(r => r.url().endsWith(`/api/games/${f.gameId}`));
    await triggerRefresh(page);
    await refresh;
    const retry = page.getByRole("button", { name: "Retry bot", exact: true });
    await expect(retry).toBeEnabled();
    await retry.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect.poll(() => steps).toBe(2);
    await page.clock.fastForward(31_000);
    expect(steps).toBe(2);
    release();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry bot", exact: true })).toHaveCount(0);
    expect(steps).toBe(2);
  });
}

test("an explicit retry still recovers silently from a competing commit", async ({ page }) => {
  const f = await fixture(page);
  let steps = 0;
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    if (steps === 1) {
      await route.fulfill({ status: 502, json: { error: "AI decision failed", code: "BOT_NETWORK_ERROR" } });
    } else {
      f.set(humanTurn(f.current()));
      await route.fulfill({ status: 409, json: { error: "Game version conflict", code: "GAME_VERSION_CONFLICT" } });
    }
  });
  await open(page, f.gameId);
  await expect(page.locator("main").getByRole("alert")).toContainText("Play is paused");
  await page.getByRole("button", { name: "Retry bot", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry bot", exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect.poll(() => steps).toBe(2);
});

test("a failure after a successful bot step cannot be retried by polling", async ({ page }) => {
  const f = await fixture(page);
  await page.clock.install();
  let steps = 0;
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    if (steps === 1) {
      const bots = f.current().poker.players.filter(p => p.controller === "bot");
      const nextBot = bots.find(p => p.id !== f.current().poker.currentActorId)!;
      f.set({ ...f.current(), version: f.current().version + 1,
        poker: { ...f.current().poker, currentActorId: nextBot.id } });
      await route.fulfill({ json: { game: f.current(), aiDecision: gameplayDecision } });
    } else {
      await route.fulfill({ status: 502, json: { error: "AI decision failed", code: "BOT_TIMEOUT" } });
    }
  });
  await open(page, f.gameId);
  await expect(page.locator("main").getByRole("alert")).toContainText("The bot request timed out.");
  await page.clock.fastForward(31_000);
  await triggerRefresh(page);
  expect(steps).toBe(2);
});

test("claim contention waits neutrally, then polling completion resumes advancement", async ({ page }) => {
  const f = await fixture(page);
  await page.clock.install();
  let steps = 0;
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    if (steps === 1) await route.fulfill({ status: 409, json: { code: "BOT_STEP_IN_PROGRESS", retryAfterMs: 90_000 } });
    else {
      f.set(humanTurn(f.current()));
      await route.fulfill({ json: { game: f.current(), aiDecision: gameplayDecision } });
    }
  });
  await open(page, f.gameId);
  await expect.poll(() => steps).toBe(1);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await page.clock.fastForward(31_000);
  expect(steps).toBe(1);
  f.set({ ...f.current(), version: f.current().version + 1 });
  await page.clock.fastForward(31_000);
  await expect.poll(() => steps).toBe(2);
  await page.clock.fastForward(90_000);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(steps).toBe(2);
});

test("claim contention completes via Realtime without waiting for lease expiry", async ({ page }) => {
  const f = await fixture(page);
  await page.clock.install();
  let sendUpdate: (() => void) | undefined;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, socket => {
    socket.onMessage(message => {
      if (typeof message !== "string") return;
      const [joinRef, ref, topic, event] = JSON.parse(message);
      if (event === "phx_join" || event === "heartbeat") socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]));
      if (event === "phx_join") sendUpdate = () => socket.send(JSON.stringify([joinRef, null, topic, "broadcast", {
        type: "broadcast", event: "game_updated", payload: { type: "game_updated", gameId: f.gameId, version: f.current().version },
      }]));
    });
  });
  let steps = 0;
  let reads = 0;
  await page.route(`**/api/games/${f.gameId}`, route => { reads++; return route.fulfill({ json: { game: f.current() } }); });
  await page.route(`**/api/games/${f.gameId}/step`, route => {
    steps++;
    return route.fulfill({ status: 409, json: { code: "BOT_STEP_IN_PROGRESS", retryAfterMs: 90_000 } });
  });
  await open(page, f.gameId);
  await expect.poll(() => steps).toBe(1);
  await expect.poll(() => Boolean(sendUpdate)).toBe(true);
  f.set(humanTurn(f.current()));
  sendUpdate!();
  await page.clock.fastForward(250);
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
  await page.clock.fastForward(90_000);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(steps).toBe(1);
});

test("claim expiry needs explicit retry, refreshes latest state and rejects duplicate clicks", async ({ page }) => {
  const f = await fixture(page);
  await page.clock.install();
  let steps = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    if (steps === 1) return route.fulfill({ status: 409, json: { code: "BOT_STEP_IN_PROGRESS", retryAfterMs: 90_000 } });
    expect(route.request().postDataJSON().expectedVersion).toBe(f.current().version);
    await held;
    f.set(humanTurn(f.current()));
    await route.fulfill({ json: { game: f.current(), aiDecision: gameplayDecision } });
  });
  const contentionResponse = page.waitForResponse(r => r.url().endsWith(`/api/games/${f.gameId}/step`));
  await open(page, f.gameId);
  await contentionResponse;
  await expect.poll(() => steps).toBe(1);
  await expect(page.getByRole("button", { name: "Stand up", exact: true })).toBeEnabled();
  // Freeze after hydration and after the contention catch has registered its timer.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await page.clock.fastForward(90_001);
  await expect(page.locator("main").getByRole("alert")).toContainText("The bot turn did not finish. Retry.");
  const pollFinished = page.waitForResponse(r => r.url().endsWith(`/api/games/${f.gameId}`));
  await page.clock.fastForward(31_000);
  await pollFinished;
  await expect(page.locator("main").getByRole("alert")).toContainText("The bot turn did not finish. Retry.");
  expect(steps).toBe(1);
  // The retry's GET observes a new version before any polling has seen it.
  f.set({ ...f.current(), version: f.current().version + 1 });
  await page.getByRole("button", { name: "Retry bot", exact: true }).evaluate(button => {
    (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
  });
  await expect.poll(() => steps).toBe(2);
  release();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(steps).toBe(2);
});

test("lost claim immediately refreshes and requires retry on the same turn", async ({ page }) => {
  const f = await fixture(page);
  await page.clock.install();
  let steps = 0;
  let reads = 0;
  await page.route(`**/api/games/${f.gameId}`, route => { reads++; return route.fulfill({ json: { game: f.current() } }); });
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    if (steps === 1) await route.fulfill({ status: 409, json: { code: "BOT_STEP_CLAIM_LOST" } });
    else {
      f.set(humanTurn(f.current()));
      await route.fulfill({ json: { game: f.current(), aiDecision: gameplayDecision } });
    }
  });
  await open(page, f.gameId);
  await expect(page.locator("main").getByRole("alert")).toContainText("The bot turn did not finish. Retry.");
  expect(reads).toBeGreaterThanOrEqual(2);
  await page.clock.fastForward(31_000);
  expect(steps).toBe(1);
  await page.getByRole("button", { name: "Retry bot", exact: true }).click();
  await expect.poll(() => steps).toBe(2);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

for (const destination of ["navigation", "eligibility loss"] as const) {
  test(`claim wait is cancelled on ${destination}`, async ({ page }) => {
    const f = await fixture(page);
    await page.clock.install();
    let steps = 0;
    await page.route(`**/api/games/${f.gameId}/step`, route => {
      steps++;
      return route.fulfill({ status: 409, json: { code: "BOT_STEP_IN_PROGRESS", retryAfterMs: 90_000 } });
    });
    await open(page, f.gameId);
    await expect.poll(() => steps).toBe(1);
    if (destination === "navigation") {
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "Exit", exact: true }).click();
      await expect(page).not.toHaveURL(new RegExp(f.gameId));
    } else {
      f.set({ ...f.current(), viewerIsHost: false, poker: { ...f.current().poker,
        players: f.current().poker.players.map(p => ({ ...p, playerToken: null, holeCards: null })) } });
      const refresh = page.waitForResponse(r => r.url().endsWith(`/api/games/${f.gameId}`));
      await triggerRefresh(page); await refresh;
    }
    await page.clock.fastForward(90_001);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    expect(steps).toBe(1);
  });
}

test("lost claim with an advanced version resumes even when the actor is unchanged", async ({ page }) => {
  const f = await fixture(page);
  let steps = 0;
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    if (steps === 1) {
      f.set({ ...f.current(), version: f.current().version + 1 });
      await route.fulfill({ status: 409, json: { code: "BOT_STEP_CLAIM_LOST" } });
    } else {
      f.set(humanTurn(f.current()));
      await route.fulfill({ json: { game: f.current(), aiDecision: gameplayDecision } });
    }
  });
  await open(page, f.gameId);
  await expect.poll(() => steps).toBe(2);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

for (const code of ["OWNER_AI_LIMIT", "GAME_AI_RATE_LIMIT"]) {
  test(`fair-use ${code} countdown preserves table and requires explicit retry`, { tag: "@smoke" }, async ({ page }) => {
    const f = await fixture(page);
    let steps = 0;
    await page.clock.install();
    await page.route(`**/api/games/${f.gameId}/step`, async route => {
      steps++;
      if (steps === 1) await route.fulfill({ status: 429, headers: { "Retry-After": "60" }, json: { code, retryAfterMs: 60_000 } });
      else { f.set(humanTurn(f.current())); await route.fulfill({ json: { game: f.current(), aiDecision: gameplayDecision } }); }
    });
    await open(page, f.gameId);
    const retry = page.getByRole("button", { name: "Retry bot", exact: true });
    await expect(retry).toBeDisabled();
    await expect(page.getByRole("button", { name: "Start a rules-only game", exact: true })).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toContainText("Retry available in");
    if (code === "OWNER_AI_LIMIT") await expect(page.locator("main").getByRole("alert")).toContainText("shared across their tables");
    await page.clock.fastForward(30_000);
    await triggerRefresh(page);
    await expect(retry).toBeDisabled();
    expect(steps).toBe(1);
    expect(page.url()).toContain(f.gameId);
    await page.clock.fastForward(31_000);
    await expect(retry).toBeEnabled();
    expect(steps).toBe(1);
    await retry.click();
    await expect.poll(() => steps).toBe(2);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });
}

test("fair-use rules-only replay creates a distinct private game and cleans navigation state", { tag: "@smoke" }, async ({ page }) => {
  const f = await fixture(page);
  const original = f.current();
  let steps = 0;
  await page.route(`**/api/games/${f.gameId}/step`, route => {
    steps++;
    return route.fulfill({ status: 429, json: { code: "OWNER_AI_LIMIT", retryAfterMs: 3600_000 } });
  });
  await open(page, f.gameId);
  const button = page.getByRole("button", { name: "Start a rules-only game", exact: true });
  await expect(button).toBeVisible();
  const creation = page.waitForRequest(r => r.url().includes("/quick-game?botMode=rules"));
  await button.click();
  await creation;
  await expect(page).not.toHaveURL(new RegExp(f.gameId));
  const newId = page.url().split("/").at(-1)!;
  const next: Game = (await (await page.request.get(`/api/games/${newId}`)).json()).game;
  expect(next.poker.players.filter(p => p.controller === "bot")).toHaveLength(5);
  expect(next.poker.players.filter(p => p.controller === "bot").every(p => p.bot?.provider === "rules")).toBe(true);
  expect(next.publication?.isPublic ?? false).toBe(false);
  expect(next.poker.players[0].playerToken).toBe(original.poker.players[0].playerToken);
  expect(steps).toBe(1);
  await expect(page.getByText("The table owner’s AI allowance")).toHaveCount(0);
});

test("fair-use notice clears on authoritative advancement before countdown expiry", async ({ page }) => {
  const f = await fixture(page);
  let steps = 0;
  await page.clock.install();
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    if (steps === 1) await route.fulfill({ status: 429, json: { code: "OWNER_AI_LIMIT", retryAfterMs: 3600_000 } });
    else { f.set(humanTurn(f.current())); await route.fulfill({ json: { game: f.current(), aiDecision: gameplayDecision } }); }
  });
  await open(page, f.gameId);
  await expect(page.getByRole("button", { name: "Retry bot", exact: true })).toBeDisabled();
  f.set({ ...f.current(), version: f.current().version + 1 });
  await triggerRefresh(page);
  await expect.poll(() => steps).toBe(2);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("fair-use rules replay creation denial keeps countdown and original table", async ({ page }) => {
  const f = await fixture(page);
  await page.clock.install();
  await page.route(`**/api/games/${f.gameId}/step`, route => route.fulfill({ status: 429, json: { code: "OWNER_AI_LIMIT", retryAfterMs: 3600_000 } }));
  let creations = 0;
  await page.route("**/quick-game?botMode=rules", route => {
    creations++;
    return route.fulfill({ status: 429, json: { code: "GAME_CREATION_LIMIT", retryAfterMs: 60_000 } });
  });
  await open(page, f.gameId);
  const button = page.getByRole("button", { name: "Start a rules-only game", exact: true });
  await button.click();
  await expect(page.getByText("Game creation is temporarily limited.", { exact: false })).toBeVisible();
  await expect(button).toBeDisabled();
  await page.clock.fastForward(61_000);
  await expect(button).toBeEnabled();
  expect(creations).toBe(1);
  expect(page.url()).toContain(f.gameId);
  await button.click();
  await expect.poll(() => creations).toBe(2);
});

test("polling during a held retry refresh cannot start a parallel bot loop", async ({ page }) => {
  const f = await fixture(page);
  await page.clock.install();
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, socket => socket.close());
  let steps = 0;
  let refreshes = 0;
  let holdRefresh = false;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/games/${f.gameId}`, async route => {
    if (holdRefresh && ++refreshes === 1) await held;
    await route.fulfill({ json: { game: f.current() } });
  });
  await page.route(`**/api/games/${f.gameId}/step`, async route => {
    steps++;
    if (steps === 1) return route.fulfill({ status: 502, json: { code: "BOT_TIMEOUT" } });
    expect(route.request().postDataJSON().expectedVersion).toBe(f.current().version);
    f.set(humanTurn(f.current()));
    await route.fulfill({ json: { game: f.current(), aiDecision: gameplayDecision } });
  });
  await open(page, f.gameId);
  await expect(page.getByRole("button", { name: "Retry bot", exact: true })).toBeEnabled();
  holdRefresh = true;
  await page.getByRole("button", { name: "Retry bot", exact: true }).evaluate(button => {
    (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
  });
  await expect.poll(() => refreshes).toBe(1);
  f.set({ ...f.current(), version: f.current().version + 1 });
  await page.clock.fastForward(5_001);
  await expect.poll(() => refreshes).toBeGreaterThan(1);
  expect(steps).toBe(1);
  release();
  await expect.poll(() => steps).toBe(2);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});
