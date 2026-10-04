import { describe, expect, it, vi } from "vitest";
import { claimSeat, assignBotToSeat, releaseSeat } from "./seat-service";
import type { AtomicSeatAssignmentRepository, SeatAssignmentRepository, SeatAssignment } from "./seat-contracts";
import type { GameHostReader } from "./host-authorization";
import { isCallerHost } from "./host-authorization";
import { GameConflictError } from "@/lib/supabase/queries";

const seat: SeatAssignment = { gameId: "game-1", seat: 1, status: "open", controller: "human", playerToken: null, isHost: false };
function fixture() {
  return {
    claimSeatIfVersion: vi.fn<AtomicSeatAssignmentRepository["claimSeatIfVersion"]>().mockResolvedValue(seat),
    assignBotIfVersion: vi.fn<AtomicSeatAssignmentRepository["assignBotIfVersion"]>().mockResolvedValue(seat),
    releaseSeatIfVersion: vi.fn<AtomicSeatAssignmentRepository["releaseSeatIfVersion"]>().mockResolvedValue(seat),
    getSeatAssignments: vi.fn<SeatAssignmentRepository["getSeatAssignments"]>().mockResolvedValue([seat]),
    getHostToken: vi.fn<GameHostReader["getHostToken"]>().mockResolvedValue("host"),
  };
}
const input = { gameId: "game-1", seat: 1, playerToken: "owner", expectedVersion: 7 };
describe("atomic seat service", () => {
  it("forwards required claim version and raw optional name to the authoritative RPC", async () => {
    const repo = fixture();
    expect(await claimSeat(repo, input)).toBe(seat);
    expect(repo.claimSeatIfVersion).toHaveBeenCalledExactlyOnceWith({ ...input, name: null });
    await claimSeat(repo, { ...input, playerName: " Ada " });
    expect(repo.claimSeatIfVersion).toHaveBeenLastCalledWith({ ...input, name: " Ada " });
    expect(repo.getSeatAssignments).not.toHaveBeenCalled();
  });
  it("forwards release version without reading or writing individual seats", async () => {
    const repo = fixture();
    expect(await releaseSeat(repo, input)).toBe(seat);
    expect(repo.releaseSeatIfVersion).toHaveBeenCalledExactlyOnceWith(input);
    expect(repo.getSeatAssignments).not.toHaveBeenCalled();
  });
  it("retains default bot naming and difficulty for an unseated host", async () => {
    const repo = fixture();
    repo.getSeatAssignments.mockResolvedValue([seat, { ...seat, seat: 2, status: "bot" }]);
    expect(await assignBotToSeat(repo, { gameId: "game-1", seat: 1, hostToken: "host", expectedVersion: 7 })).toBe(seat);
    expect(repo.assignBotIfVersion).toHaveBeenCalledExactlyOnceWith({ gameId: "game-1", seat: 1, hostToken: "host", expectedVersion: 7,
      name: "TypeSafe Jev #2", bot: { id: "jev", label: "TypeSafe Jev", provider: "typesafe", modelId: "jev-latest" }, aiDifficulty: "medium", botProfileId: null });
  });
  it.each(["rules", "llm"] as const)("retains %s defaults and explicit options", async provider => {
    const repo = fixture();
    const bot = { id: provider, label: provider, provider, modelId: null };
    const args = { gameId: "game-1", seat: 1, hostToken: "host", expectedVersion: 7, bot };
    await assignBotToSeat(repo, args);
    expect(repo.assignBotIfVersion).toHaveBeenLastCalledWith(expect.objectContaining({ aiDifficulty: provider === "rules" ? "medium" : null, botProfileId: provider === "llm" ? "balanced" : null }));
    await assignBotToSeat(repo, { ...args, difficulty: "hard", botProfileId: "tight" });
    expect(repo.assignBotIfVersion).toHaveBeenLastCalledWith(expect.objectContaining({ aiDifficulty: provider === "rules" ? "hard" : null, botProfileId: provider === "llm" ? "tight" : null }));
  });
  it.each([null, "someone-else"])("rejects missing or different durable hosts despite seat flags", async hostToken => {
    const repo = fixture();
    repo.getHostToken.mockResolvedValue(hostToken);
    repo.getSeatAssignments.mockResolvedValue([{ ...seat, isHost: true, playerToken: "host" }]);
    await expect(assignBotToSeat(repo, { gameId: "game-1", seat: 1, hostToken: "host", expectedVersion: 7 })).rejects.toThrow("Only the host can assign bots");
    expect(repo.assignBotIfVersion).not.toHaveBeenCalled();
    expect(await isCallerHost(repo, "game-1", "host")).toBe(false);
  });
  it.each(["claim", "assign", "release"])("propagates %s conflicts unchanged", async operation => {
    const repo = fixture();
    const conflict = new GameConflictError("game-1", 7);
    repo.claimSeatIfVersion.mockRejectedValue(conflict);
    repo.assignBotIfVersion.mockRejectedValue(conflict);
    repo.releaseSeatIfVersion.mockRejectedValue(conflict);
    const result = operation === "claim" ? claimSeat(repo, input) : operation === "release" ? releaseSeat(repo, input) : assignBotToSeat(repo, { ...input, hostToken: "host" });
    await expect(result).rejects.toBe(conflict);
  });
  it.each(["Seat does not belong to this player", "Seat is not open", "Seat does not exist"])("preserves RPC errors: %s", async message => {
    const repo = fixture();
    repo.claimSeatIfVersion.mockRejectedValue(new Error(message));
    repo.releaseSeatIfVersion.mockRejectedValue(new Error(message));
    await expect(claimSeat(repo, input)).rejects.toThrow(message);
    await expect(releaseSeat(repo, input)).rejects.toThrow(message);
  });
});

it("missing host records never authorize a caller, including anonymous callers", async () => {
  const repo: GameHostReader = { getHostToken: async () => null };
  expect(await isCallerHost(repo, "game-1", "any-token")).toBe(false);
  expect(await isCallerHost(repo, "game-1", null)).toBe(false);
});

it.each(["missing", "occupied"])("rejects %s bot targets before invoking the mutation", async state => {
  const repo = fixture();
  repo.getSeatAssignments.mockResolvedValue(state === "missing" ? [] : [{ ...seat, status: "claimed" }]);
  await expect(assignBotToSeat(repo, { gameId: "game-1", seat: 1, hostToken: "host", expectedVersion: 7 })).rejects.toThrow(state === "missing" ? "Seat does not exist" : "Seat is not open");
  expect(repo.assignBotIfVersion).not.toHaveBeenCalled();
});
