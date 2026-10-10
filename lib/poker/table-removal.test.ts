import { expect, it, vi } from "vitest";
import { removeTable, TableRemovalError, type RemovalInput } from "./table-removal";
import { createDeterministicDeck, pokerEngineAdapter } from "./adapter";
import { GameConflictError, type PersistedGame } from "@/lib/supabase/queries";
function fixture() {
  const state = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({ smallBlind: 5, bigBlind: 10,
    players: [0, 1, 2].map(seat => ({ id: `p${seat}`, seat, name: `Player ${seat}`, controller: "human", status: "claimed", stack: 1000, playerToken: `owner${seat}` })) }), createDeterministicDeck());
  const game: PersistedGame = { id: "game", version: 3, currentState: state, stateSchemaVersion: 1, handNumber: 1, status: "playing" };
  const seats = state.config.players.map(p => ({ gameId: "game", seat: p.seat, controller: "human" as const, status: "claimed" as const, playerToken: p.playerToken!, isHost: false, leaving: false, enginePlayerId: p.id }));
  return { state, seats, repository: { getGame: vi.fn(async () => game), getHostToken: vi.fn(async () => "host"),
    getSeatAssignments: vi.fn(async () => seats), removeGameIfVersion: vi.fn<(input: RemovalInput) => Promise<unknown>>(async () => ({ outcome: "ok", version: 4 })) } };
}
it("prepares a legal fold only for the departing actor and returns no private data", async () => {
  const f = fixture(); const actor = pokerEngineAdapter.snapshot(f.state).currentActorId!;
  const seat = f.seats.find(p => p.enginePlayerId === actor)!;
  expect(await removeTable(f.repository, { gameId: "game", expectedVersion: 3, playerToken: seat.playerToken, operation: "leave_and_remove" })).toEqual({ version: 4 });
  expect(f.repository.removeGameIfVersion).toHaveBeenCalledWith(expect.objectContaining({ fold: expect.objectContaining({ action: "fold", playerEngineId: actor, stateBefore: f.state }) }));
});
it("registers out-of-turn and repeated pending departures without a second fold", async () => {
  const f = fixture(); const actor = pokerEngineAdapter.snapshot(f.state).currentActorId!;
  const seat = f.seats.find(p => p.enginePlayerId !== actor)!;
  await removeTable(f.repository, { gameId: "game", expectedVersion: 3, playerToken: seat.playerToken, operation: "leave_and_remove" });
  expect(f.repository.removeGameIfVersion.mock.calls[0][0]).not.toHaveProperty("fold");
  f.seats.find(p => p.enginePlayerId === actor)!.leaving = true;
  await removeTable(f.repository, { gameId: "game", expectedVersion: 3, playerToken: f.seats.find(p => p.enginePlayerId === actor)!.playerToken, operation: "leave_and_remove" });
  expect(f.repository.removeGameIfVersion.mock.calls[1][0]).not.toHaveProperty("fold");
});
it.each(["host", "spectator"])("rejects unauthorized joined removal by %s before preparation", async playerToken => {
  const f = fixture();
  await expect(removeTable(f.repository, { gameId: "game", expectedVersion: 3, playerToken, operation: "leave_and_remove" })).rejects.toBeInstanceOf(TableRemovalError);
  expect(f.repository.getGame).not.toHaveBeenCalled(); expect(f.repository.removeGameIfVersion).not.toHaveBeenCalled();
});
it("rejects stale departure before committing", async () => {
  const f = fixture();
  await expect(removeTable(f.repository, { gameId: "game", expectedVersion: 2, playerToken: "owner0", operation: "leave_and_remove" })).rejects.toBeInstanceOf(GameConflictError);
  expect(f.repository.removeGameIfVersion).not.toHaveBeenCalled();
});
it.each([null, {}, { outcome: "ok", version: -1 }, { outcome: "ok", version: 4, playerToken: "secret" }])("rejects invalid RPC responses %j", async result => {
  const f = fixture(); f.repository.removeGameIfVersion.mockResolvedValue(result as never);
  await expect(removeTable(f.repository, { gameId: "game", expectedVersion: 3, playerToken: "host", operation: "delete" })).rejects.toThrow();
});
it.each(["forbidden", "blocked", "conflict", "missing"])("maps %s transaction results", async outcome => {
  const f = fixture(); f.repository.removeGameIfVersion.mockResolvedValue({ outcome } as never);
  await expect(removeTable(f.repository, { gameId: "game", expectedVersion: 3, playerToken: "host", operation: "delete" })).rejects.toMatchObject({ outcome });
});

it("does not fold an all-in participant and preserves the engine state", async () => {
  const f = fixture(); const actor=pokerEngineAdapter.snapshot(f.state).currentActorId!;
  const allIn=pokerEngineAdapter.applyAction(f.state,actor,{ type:"raise",amount:1000 });
  f.repository.getGame.mockResolvedValue({ ...await f.repository.getGame(),currentState:allIn });
  const seat=f.seats.find(s=>s.enginePlayerId===actor)!;
  await removeTable(f.repository,{ gameId:"game",expectedVersion:3,playerToken:seat.playerToken,operation:"leave_and_remove" });
  expect(f.repository.removeGameIfVersion.mock.calls[0][0]).not.toHaveProperty("fold");
  expect((await f.repository.getGame()).currentState).toEqual(allIn);
});

it("lets an unseated host hide a table without preparing an action", async () => {
  const f = fixture();
  expect(await removeTable(f.repository, { gameId: "game", expectedVersion: 3, playerToken: "host", operation: "remove_from_list" })).toEqual({ version: 4 });
  expect(f.repository.getGame).not.toHaveBeenCalled();
  expect(f.repository.removeGameIfVersion).toHaveBeenCalledWith({ gameId: "game", expectedVersion: 3, playerToken: "host", operation: "remove_from_list" });
});
it("prepares the seated host's legal departure before hiding the table", async () => {
  const f = fixture(); const actor = pokerEngineAdapter.snapshot(f.state).currentActorId!;
  const seat = f.seats.find(s => s.enginePlayerId === actor)!;
  f.repository.getHostToken.mockResolvedValue(seat.playerToken);
  await removeTable(f.repository, { gameId: "game", expectedVersion: 3, playerToken: seat.playerToken, operation: "remove_from_list" });
  expect(f.repository.removeGameIfVersion).toHaveBeenCalledWith(expect.objectContaining({ fold: expect.objectContaining({ action: "fold", playerEngineId: actor }) }));
});
it.each(["owner0", "spectator"])("rejects host personal removal by %s before reading seats or state", async playerToken => {
  const f = fixture();
  await expect(removeTable(f.repository, { gameId: "game", expectedVersion: 3, playerToken, operation: "remove_from_list" })).rejects.toBeInstanceOf(TableRemovalError);
  expect(f.repository.getSeatAssignments).not.toHaveBeenCalled();
  expect(f.repository.getGame).not.toHaveBeenCalled();
  expect(f.repository.removeGameIfVersion).not.toHaveBeenCalled();
});
it("rejects stale seated host removal before preparing a fold", async () => {
  const f = fixture(); f.repository.getHostToken.mockResolvedValue("owner0");
  await expect(removeTable(f.repository, { gameId: "game", expectedVersion: 2, playerToken: "owner0", operation: "remove_from_list" })).rejects.toBeInstanceOf(GameConflictError);
  expect(f.repository.removeGameIfVersion).not.toHaveBeenCalled();
});
