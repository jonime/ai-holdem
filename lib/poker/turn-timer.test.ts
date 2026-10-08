import lobbyFixture from "@/test/fixtures/turn-timer-lobby.json";
import { describe, expect, it, vi } from "vitest";
import { pokerEngineAdapter, createDeterministicDeck } from "./adapter";
import { advanceTimeout, BotStepForbiddenError, createDemoGameConfig } from "./game-service";
import { GameConflictError, type PersistedGame, type PersistHumanActionInput } from "@/lib/supabase/queries";
import { humanTurnSecondsSchema } from "@/lib/http/schemas";

const decisionId = "00000000-0000-4000-8000-000000000001";
function fixture(check = false, leaving = false) {
  let state = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({ smallBlind: 50, bigBlind: 100, humanTurnSeconds: 60,
    players: [{ id: "a", seat: 0, name: "A", controller: "human", stack: 1000, playerToken: "owner-a", status: "claimed" },
      { id: "b", seat: 1, name: "B", controller: "human", stack: 1000, playerToken: "owner-b", status: "claimed" }] }),createDeterministicDeck());
  if (check) state = pokerEngineAdapter.applyAction(state,"a",{ type: "call" });
  const actor = pokerEngineAdapter.snapshot(state).currentActorId!;
  const persisted: PersistedGame = { id: "game", status: "playing", version: 1, handNumber: 1, stateSchemaVersion: 1, currentState: state,
    turnTimer: { decisionId, actorEngineId: actor, handNumber: 1, deadline: "2026-01-01T00:00:00Z" } };
  const persistTimeout = vi.fn(async (input: PersistHumanActionInput) => ({ ...persisted, currentState: input.currentState, version: 2, status: input.status, turnTimer: null }));
  const repository = { updateSeatAssignment: vi.fn(async () => {}), getGame: vi.fn(async () => persisted), getHostToken: vi.fn(async () => "host"),
    getSeatAssignments: vi.fn(async () => state.config.players.map(player => ({ gameId: "game", seat: player.seat, name: player.name,
      controller: "human" as const, status: "claimed" as const, enginePlayerId: player.id, playerToken: player.playerToken!,
      isHost: false, leaving: player.id === actor && leaving }))),
    getCurrentHandRevealedPlayerIds: vi.fn(async () => []), persistTimeout };
  return { state, persisted, repository, actor };
}

describe("human turn timers", () => {
  it("keeps the browser waiting fixture synchronized with the adapter", () => {
    expect(pokerEngineAdapter.createGame(createDemoGameConfig({hostToken:"timer-fixture"}))).toEqual(lobbyFixture);
  });
  it("defaults custom tables to 60 and accepts only Off/30/60/90", () => {
    expect(createDemoGameConfig().humanTurnSeconds).toBe(60);
    for (const value of [null,30,60,90]) expect(humanTurnSecondsSchema.safeParse(value).success).toBe(true);
    for (const value of [0,1,45,"60",undefined]) expect(humanTurnSecondsSchema.safeParse(value).success).toBe(false);
  });
  it.each([false,true])("prepares engine-validated %s check availability", async check => {
    const f = fixture(check);
    const result = await advanceTimeout(f.repository,"game",1,decisionId,"owner-a");
    expect(f.repository.persistTimeout.mock.calls[0][0].action).toBe(check ? "check" : "fold");
    expect(result.version).toBe(2);
    expect(result.poker.players.every(player => player.status === "claimed" && !player.leaving)).toBe(true);
  });
  it("folds a departing actor even when checking is legal", async () => {
    const f = fixture(true,true);
    await advanceTimeout(f.repository,"game",1,decisionId,"host");
    expect(f.repository.persistTimeout.mock.calls[0][0].action).toBe("fold");
  });
  it.each([null,"spectator"])("rejects unauthorized driver %s before writing",async viewer => {
    const f = fixture();
    await expect(advanceTimeout(f.repository,"game",1,decisionId,viewer)).rejects.toBeInstanceOf(BotStepForbiddenError);
    expect(f.repository.persistTimeout).not.toHaveBeenCalled();
  });
  it.each(["version","decision","actor","hand"])("rejects stale %s",async field => {
    const f = fixture();
    const version = field === "version" ? 0 : 1;
    const decision = field === "decision" ? "different" : decisionId;
    f.repository.getGame.mockResolvedValue({ ...f.persisted, turnTimer: { ...f.persisted.turnTimer!,
      ...(field === "actor" ? { actorEngineId: "wrong" } : {}), ...(field === "hand" ? { handNumber: 2 } : {}) } });
    await expect(advanceTimeout(f.repository,"game",version,decision,"host")).rejects.toBeInstanceOf(GameConflictError);
    expect(f.repository.persistTimeout).not.toHaveBeenCalled();
  });
  it("adapter counts dealt humans, excludes bots and never times all-ins or complete hands", () => {
    const f = fixture();
    expect(pokerEngineAdapter.timerTransition(f.state)).toEqual({ handNumber: 1, multiplayer: true, actorEngineId: "a" });
    const solo = { ...f.state, config: { ...f.state.config, players: f.state.config.players.map(player => player.id === "b" ? { ...player, controller: "bot" as const } : player) } };
    expect(pokerEngineAdapter.timerTransition(solo).multiplayer).toBe(false);
    const complete = pokerEngineAdapter.applyAction(f.state,"a",{type:"fold"});
    expect(pokerEngineAdapter.timerTransition(complete).actorEngineId).toBeNull();
    const allIn = pokerEngineAdapter.applyAction(f.state,"a",{type:"raise",amount:1000});
    const ended = pokerEngineAdapter.applyAction(allIn,"b",{type:"call"});
    expect(pokerEngineAdapter.timerTransition(ended).actorEngineId).toBeNull();
  });
});
