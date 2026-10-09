import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import lobbyFixture from "../fixtures/turn-timer-lobby.json";

const created: string[] = [];
function localClient() {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("UI fixtures require loopback Supabase.");
  }
  return createClient(url.origin, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test.afterEach(async () => {
  if (!created.length) return;
  const client = localClient();
  for (const id of created.splice(0)) {
    for (const table of ["actions", "hand_card_reveals", "hands", "game_players", "games"]) {
      const { error } = await client.from(table).delete().eq(table === "games" ? "id" : "game_id", id);
      if (error) throw new Error(`UI fixture cleanup failed for ${table}.`);
    }
  }
});

/** UI setup avoids spending the shared IP creation allowance; browser mutations stay real. */
export async function createUITable(page: Page, bots = false): Promise<string> {
  if (process.env.E2E_PRODUCTION !== "true" || process.env.E2E_BASE_URL) {
    if (bots) {
      const response = await page.request.post("/quick-game", { headers: { Accept: "application/json" } });
      expect(response.status()).toBe(201);
      return (await response.json()).gameId;
    }
    await page.getByRole("button", { name: "Create table" }).click();
    await expect(page).toHaveURL(/\/game\//);
    return page.url().split("/").at(-1)!;
  }
  const token = randomUUID();
  const state = { ...lobbyFixture, config: { ...lobbyFixture.config, humanTurnSeconds: bots ? null : 60,
    players: lobbyFixture.config.players.map(player => ({ ...player, playerToken: token })) } };
  const seats = Array.from({ length: 6 }, (_, seat) => ({
    seat, name: seat === 0 ? "Player 1" : bots ? `Equity Rules #${seat}` : `Seat ${seat + 1}`,
    controller: seat > 0 && bots ? "bot" : "human", stack: 10000,
    status: seat === 0 ? "claimed" : bots ? "bot" : "open",
    engine_player_id: seat === 0 ? "human" : null, player_token: seat === 0 ? token : null, is_host: seat === 0,
    ...(seat > 0 && bots ? { bot_id: "equity-rules-v2", bot_label: "Equity Rules", bot_provider: "rules", ai_difficulty: "medium" } : {}),
  }));
  const { data, error } = await localClient().rpc("create_game_session", {
    p_current_state: state, p_state_schema_version: 1, p_hand_number: 0, p_status: "waiting",
    p_host_token: token, p_players: seats,
  });
  if (error) throw new Error("UI fixture creation failed.");
  const id: unknown = data?.[0]?.id;
  expect(typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)).toBe(true);
  if (typeof id !== "string") throw new Error("UI fixture ID is missing.");
  created.push(id);
  await page.context().addCookies([{ name: "ai-holdem-player-id", value: token, url: String(test.info().project.use.baseURL) }]);
  if (bots) {
    const response = await page.request.post(`/api/games/${id}/start`, { data: { expectedVersion: 0 } });
    expect(response.ok()).toBe(true);
  }
  return id;
}
