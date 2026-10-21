import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./[gameId]/hands/[handNumber]/replay/route";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { replayResponseSchema } from "@/lib/http/replay-contracts";
const { rpc, log } = vi.hoisted(() => ({ rpc: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => ({ rpc }) }));
vi.mock("@/lib/logging/application-failure", () => ({ classifyApplicationFailure: () => "unexpected", logApplicationFailure: log }));
const gameId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ gameId, handNumber: "1" }) };
const request = () => new Request(`http://localhost/api/games/${gameId}/hands/1/replay`, { headers: { cookie: "ai-holdem-player-id=owner" } });
function fixture() {
  const state = engine.startHand(engine.createGame({ smallBlind: 5, bigBlind: 10, players: [
    { id: "a", name: "Same", controller: "human", seat: 0, stack: 1000, playerToken: "owner" },
    { id: "b", name: "Same", controller: "human", seat: 1, stack: 1000, playerToken: "other" },
  ] }), createDeterministicDeck());
  return { gameId, handNumber: 1, status: "complete", initialState: state, finalState: engine.applyAction(state,"a",{ type: "fold" }),
    revealedIds: [], actions: [{ sequence: 1, street: "preflop", actorSeat: 0, action: "fold", amount: null, stateBefore: state }] };
}
beforeEach(() => { rpc.mockReset(); log.mockReset(); });
it("reads one snapshot, resolves the cookie, validates explicit fields and prevents all caching", async () => {
  rpc.mockResolvedValue({ data: fixture(), error: null });
  const response = await GET(request(), context);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  const { replay } = replayResponseSchema.parse(await response.json());
  expect(replay.bigBlind).toBe(10);
  expect(replay.frames[0].players[0].cards).toHaveLength(2);
  expect(replay.frames.every(f => f.players[1].cards === null)).toBe(true);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("get_hand_replay", { p_game_id: gameId, p_hand_number: 1 });
  expect(JSON.stringify(replay)).not.toMatch(/playerToken|engineState|stateBefore|owner|other|provider/);
});
it.each([[null,404,"REPLAY_MISSING"],[{ ...fixture(), status: "playing" },409,"REPLAY_UNFINISHED"],[{},422,"REPLAY_UNAVAILABLE"]])("returns typed private failure %i", async (data,status,code) => {
  rpc.mockResolvedValue({ data, error: null });
  const response = await GET(request(), context);
  expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ code }); expect(log).not.toHaveBeenCalled();
});
it("uses sanitized failure logging for database errors", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE SQL" } });
  const response = await GET(request(),context);
  expect(response.status).toBe(500); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");
  expect(log).toHaveBeenCalledExactlyOnceWith({ operation: "replay", category: "unexpected", status: 500 });
});
it("rejects invalid path input with private headers before reading", async () => {
  for (const handNumber of ["0", "-1", "2147483648", "1.5", "abc"]) {
    const response = await GET(request(), { params: Promise.resolve({ gameId, handNumber }) });
    expect(response.status).toBe(400); expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(rpc).not.toHaveBeenCalled();
});

it("accepts older replay responses and frozen shares without blind metadata", async () => {
  const { sharedReplaySchema } = await import("@/lib/http/share-contracts");
  rpc.mockResolvedValue({ data: fixture(), error: null });
  const { replay } = replayResponseSchema.parse(await (await GET(request(), context)).json());
  const { bigBlind, ...legacy } = replay;
  expect(bigBlind).toBe(10);
  expect(replayResponseSchema.parse({ replay: legacy }).replay.bigBlind).toBeUndefined();
  const snapshot = { dealerSeat: legacy.dealerSeat, smallBlindSeat: legacy.smallBlindSeat, bigBlindSeat: legacy.bigBlindSeat, participants: legacy.participants, frames: legacy.frames, pots: legacy.pots };
  expect(sharedReplaySchema.parse({ schemaVersion: 1, replay: snapshot }).replay.bigBlind).toBeUndefined();
  expect(sharedReplaySchema.parse({ schemaVersion: 1, replay: { ...snapshot, bigBlind: 10 } }).replay.bigBlind).toBe(10);
  for (const bigBlind of [0, -1, 1.5, null, "10"]) {
    expect(replayResponseSchema.safeParse({ replay: { ...legacy, bigBlind } }).success).toBe(false);
    expect(sharedReplaySchema.safeParse({ schemaVersion: 1, replay: { ...snapshot, bigBlind } }).success).toBe(false);
  }
});
