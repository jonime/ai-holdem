import { describe, expect, it, vi } from "vitest";
import { pokerEngineAdapter, createDeterministicDeck } from "./adapter";
import { advanceDeparture, BotStepForbiddenError, departureFold, prepareSeatDeparture, reconcilePublicSeats, submitHumanAction } from "./game-service";
import { releaseSeat } from "./seat-service";
import { GameConflictError, type PersistedGame, type PersistHumanActionInput, type GameReadSnapshot } from "@/lib/supabase/queries";
import type { PokerGameState } from "./types";
import type { SeatAssignment } from "./seat-contracts";

function fixture(stacks = [1000, 1000, 1000]) {
  let state = pokerEngineAdapter.startHand(pokerEngineAdapter.createGame({ smallBlind: 5, bigBlind: 10,
    players: stacks.map((stack, seat) => ({ id: `p${seat}`, name: `Player ${seat}`, seat,
      controller: "human", stack, status: "claimed", playerToken: `owner${seat}` })) }), createDeterministicDeck());
  let game: PersistedGame = { id: "game", currentState: state, status: "playing", version: 3, handNumber: 1, stateSchemaVersion: 1 };
  let seats: SeatAssignment[] = state.config.players.map(player => ({ gameId: game.id, seat: player.seat,
    name: player.name, status: "claimed", controller: "human", playerToken: player.playerToken ?? null,
    isHost: false, leaving: false, enginePlayerId: player.id }));
  const actions: PersistHumanActionInput[] = [];
  const commit = async (input: PersistHumanActionInput) => {
    if (game.version !== input.expectedVersion) throw new GameConflictError(game.id, input.expectedVersion);
    actions.push(input); state = pokerEngineAdapter.restore(input.currentState as PokerGameState);
    game = { ...game, currentState: state, status: input.status, version: game.version + 1 };
    if (game.status === "complete") seats = seats.map(seat => seat.leaving
      ? { ...seat, status: "open", leaving: false, playerToken: null, enginePlayerId: null } : seat);
    return game;
  };
  const repository = {
    getGame: vi.fn(async () => game), getHostToken: vi.fn(async () => "host"),
    getSeatAssignments: vi.fn(async () => seats), updateSeatAssignment: vi.fn(),
    getGameReadSnapshot: vi.fn(async (): Promise<GameReadSnapshot> => ({ game, hostToken: "host", listing: null,
      assignments: seats.map(seat => ({ ...seat, name: seat.name ?? "", bot: null, aiDifficulty: null,
        botProfileId: null, leaving: seat.leaving ?? false, enginePlayerId: seat.enginePlayerId ?? null })), revealedPlayerIds: [] })),
    advanceDepartureIfVersion: vi.fn(commit), persistHumanAction: vi.fn(commit),
    releaseSeatIfVersion: vi.fn(async (input: { seat: number; fold?: PersistHumanActionInput }) => {
      seats = seats.map(seat => seat.seat === input.seat ? { ...seat, leaving: true } : seat);
      if (input.fold) await commit(input.fold); else game = { ...game, version: game.version + 1 };
      return seats[input.seat];
    }),
  };
  return { repository, actions, game: () => game, state: () => state, seats: () => seats,
    depart: (id: string) => { seats = seats.map(seat => seat.enginePlayerId === id ? { ...seat, leaving: true } : seat); },
    move: async (action: Parameters<typeof pokerEngineAdapter.applyAction>[2]) => {
      const actor = pokerEngineAdapter.snapshot(state).currentActorId!;
      const after = pokerEngineAdapter.applyAction(state, actor, action);
      const snapshot = pokerEngineAdapter.snapshot(after);
      state = after; game = { ...game, currentState: state, status: snapshot.street === "complete" ? "complete" : "playing" };
    } };
}

describe("human departure engine/service boundary", () => {
  it("folds the current actor exactly once through the shared release service", async () => {
    const f = fixture(); const actor = pokerEngineAdapter.snapshot(f.state()).currentActorId!;
    const seat = f.seats().find(seat => seat.enginePlayerId === actor)!;
    await releaseSeat(f.repository, { gameId: "game", seat: seat.seat, playerToken: seat.playerToken!, expectedVersion: 3 });
    expect(f.actions).toHaveLength(1); expect(f.actions[0]).toMatchObject({ action: "fold", amount: null, expectedVersion: 3 });
    expect(pokerEngineAdapter.snapshot(f.state()).currentActorId).not.toBe(actor);
    expect(f.repository.updateSeatAssignment).not.toHaveBeenCalled();
  });
  it("registers out-of-turn departure and authorizes continuation by another human or an unseated host", async () => {
    const f = fixture(); const actor = pokerEngineAdapter.snapshot(f.state()).currentActorId!;
    const other = f.seats().find(seat => seat.enginePlayerId !== actor)!;
    expect(await prepareSeatDeparture(f.repository, { gameId: "game", seat: other.seat,
      playerToken: other.playerToken!, expectedVersion: 3 })).toBeUndefined();
    f.depart(actor);
    const result = await advanceDeparture(f.repository, "game", 3, other.playerToken);
    expect(result.version).toBe(4); expect(f.actions[0].playerEngineId).toBe(actor);
    const next = pokerEngineAdapter.snapshot(f.state()).currentActorId!; f.depart(next);
    expect((await advanceDeparture(f.repository, "game", 4, "host")).status).toBe("complete");
    expect(f.actions.map(action => action.action)).toEqual(["fold", "fold"]);
  });
  it("rejects spectators, stale requests and ordinary human turns before any commit", async () => {
    const f = fixture();
    await expect(advanceDeparture(f.repository, "game", 3, "spectator")).rejects.toBeInstanceOf(BotStepForbiddenError);
    await expect(advanceDeparture(f.repository, "game", 2, "owner0")).rejects.toBeInstanceOf(GameConflictError);
    await expect(advanceDeparture(f.repository, "game", 3, "host")).rejects.toBeInstanceOf(GameConflictError);
    expect(f.repository.advanceDepartureIfVersion).not.toHaveBeenCalled();
  });
  it("does not fold already-folded or all-in humans out of turn", async () => {
    for (const action of [{ type: "fold" as const }, { type: "raise" as const, amount: 1000 }]) {
      const f = fixture(); const actor = pokerEngineAdapter.snapshot(f.state()).currentActorId!;
      await f.move(action);
      const seat = f.seats().find(seat => seat.enginePlayerId === actor)!;
      expect(await prepareSeatDeparture(f.repository, { gameId: "game", seat: seat.seat,
        playerToken: seat.playerToken!, expectedVersion: 3 })).toBeUndefined();
      expect(f.actions).toHaveLength(0);
    }
  });
  it("records the fold actually applied when a leaving owner proposes a raise", async () => {
    const f = fixture(); const actor = pokerEngineAdapter.snapshot(f.state()).currentActorId!;
    f.depart(actor);
    const token = f.seats().find(seat => seat.enginePlayerId === actor)!.playerToken!;
    const before = f.state();
    await submitHumanAction(f.repository, "game", { expectedVersion: 3, playerId: token, action: { type: "raise", amount: 100 } });
    expect(f.actions[0]).toMatchObject({ action: "fold", amount: null });
    expect(f.actions[0].stateBefore).toEqual(before);
  });
  it("preserves completed identities, private cards and engine awards after seat cleanup/reassignment", async () => {
    const f = fixture(); const original = f.state();
    let completed = original;
    while (pokerEngineAdapter.snapshot(completed).street !== "complete") {
      completed = pokerEngineAdapter.applyAction(completed, pokerEngineAdapter.snapshot(completed).currentActorId!, { type: "fold" });
    }
    const seats: SeatAssignment[] = f.seats().map(seat => ({ ...seat, status: "open" as const, playerToken: null, enginePlayerId: null }));
    seats[0] = { ...seats[0], name: "New occupant", playerToken: "new-owner", enginePlayerId: "new-player" };
    const reconciled = reconcilePublicSeats("game", completed, seats);
    expect(reconciled.engineState).toEqual(completed.engineState);
    expect(reconciled.config.players.map(player => player.name)).toEqual(completed.config.players.map(player => player.name));
    const owner = pokerEngineAdapter.publicProjection(reconciled, "p0");
    const stranger = pokerEngineAdapter.publicProjection(reconciled, null);
    expect(owner.players[0].holeCards?.every(Boolean)).toBe(true);
    expect(stranger.players[0].holeCards).toBeNull();
    expect(owner.winnerAmounts).toEqual(pokerEngineAdapter.snapshot(completed).winnerAmounts);
    expect(owner.players.every(player => player.status === "open")).toBe(true);
  });
  it("leaves an all-in participant eligible for main and side pots", async () => {
    const f = fixture([50, 100, 200]);
    await f.move({ type: "raise", amount: 50 });
    const allin = f.state();
    expect(pokerEngineAdapter.publicProjection(allin, null).players[0].allIn).toBe(true);
    f.depart("p0");
    // Continue with legal engine actions; no departure fold is prepared for p0.
    await f.move({ type: "raise", amount: 100 });
    await f.move({ type: "call", amount: 90 });
    const final = pokerEngineAdapter.snapshot(f.state());
    expect(final.street).toBe("complete"); expect(final.completionReason).toBe("showdown");
    expect(Object.values(final.winnerAmounts).reduce((sum, value) => sum + value, 0)).toBe(250);
    expect(pokerEngineAdapter.publicProjection(f.state(), null).players[0].folded).toBe(false);
  });
  it("does not accept unauthorized departure or fold preparation for a different actor", async () => {
    const f = fixture();
    await expect(prepareSeatDeparture(f.repository, { gameId: "game", seat: 0, playerToken: "other", expectedVersion: 3 }))
      .rejects.toThrow("Seat does not belong");
    expect(() => departureFold(f.game(), "unknown")).toThrow(GameConflictError);
  });
});

it("separates a replacement occupant's live ownership from the completed participant's private cards", async () => {
  const f = fixture();
  await releaseSeat(f.repository, { gameId: "game", seat: 0, playerToken: "owner0", expectedVersion: 3 });
  f.depart("p1"); await advanceDeparture(f.repository, "game", 4, "host");
  f.seats()[0] = { ...f.seats()[0], status: "claimed", enginePlayerId: "replacement", playerToken: "new-owner", name: "Replacement" };
  const { getPublicGame } = await import("./game-service");
  const { canAdvanceBots, tableFlow } = await import("@/components/poker/view-model");
  const replacement = await getPublicGame(f.repository, "game", "new-owner");
  const original = await getPublicGame(f.repository, "game", "owner0");
  expect(replacement.poker.players[0]).toMatchObject({ id: "p0", name: "Player 0", playerToken: null, holeCards: null, status: "open" });
  expect(replacement.poker.seats?.[0]).toMatchObject({ id: "replacement", status: "claimed", playerToken: "new-owner", stack: 1000 });
  expect(original.poker.players[0].holeCards).toHaveLength(2);
  expect(original.poker.seats?.[0].playerToken).toBeNull();
  expect(canAdvanceBots(replacement, "new-owner")).toBe(true);
  expect(canAdvanceBots(original, "owner0")).toBe(false);
  expect(tableFlow(replacement.poker.players, "complete", "new-owner", false, replacement.poker.seats).canStartNextHand).toBe(true);
});
