import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./[gameId]/results/route";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { resultsResponseSchema } from "@/lib/http/results-contracts";
const { rpc, log } = vi.hoisted(() => ({ rpc: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => ({ rpc }) }));
vi.mock("@/lib/logging/application-failure", () => ({ classifyApplicationFailure: () => "unexpected", logApplicationFailure: log }));
const gameId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ gameId }) };
function page() {
  const initialState = engine.startHand(engine.createGame({ smallBlind: 5, bigBlind: 10, players: [
    { id: "a", name: "Same", controller: "human", seat: 0, stack: 1000, playerToken: "owner" },
    { id: "b", name: "Same", controller: "human", seat: 1, stack: 1000, playerToken: "other" },
  ] }), createDeterministicDeck());
  return { throughHand: 1, hands: [{ handNumber: 1, initialState, finalState: engine.applyAction(initialState, "a", { type: "fold" }) }] };
}
const request = (token?: string) => new Request(`http://localhost/api/games/${gameId}/results?playerToken=other`, {
  headers: token ? { cookie: `ai-holdem-player-id=${token}` } : {},
});
beforeEach(() => { rpc.mockReset(); log.mockReset(); });
it("uses only cookie ownership, excludes private state and disables caching", async () => {
  rpc.mockResolvedValue({ data: page(), error: null });
  const response = await GET(request("owner"), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.json();
  expect(resultsResponseSchema.parse(body).results).toMatchObject({ handsPlayed: 1, netChips: -5 });
  expect(JSON.stringify(body)).not.toMatch(/playerToken|engineState|initialState|finalState|cards|"owner"|"other"|Same/);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("get_personal_results_page", { p_game_id: gameId, p_after_hand: 0 });
  expect((await (await GET(request("other"), context)).json()).results.netChips).toBe(5);
  for (const token of [undefined, "host-only", "Same"]) {
    expect((await (await GET(request(token), context)).json()).results).toMatchObject({ handsPlayed: 0, netChips: 0 });
  }
});
it("returns sanitized retryable errors, without exposing failed intermediate pages", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE SQL owner" } });
  log.mockReturnValue("11111111-1111-4111-8111-111111111111");
  const response = await GET(request("owner"), context);
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ error: "Unable to load results", requestReference: "11111111-1111-4111-8111-111111111111" });
  expect(log).toHaveBeenCalledExactlyOnceWith({ operation: "results", category: "unexpected", status: 500 });
});
it("handles removed tables and invalid paths without logging expected outcomes", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  expect((await GET(request(), context)).status).toBe(404);
  rpc.mockClear();
  expect((await GET(request(), { params: Promise.resolve({ gameId: "invalid" }) })).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});
