import type { AIDifficulty, BotDescriptor, BotPlaystyleId } from "./types";
import type { AtomicSeatAssignmentRepository, SeatAssignmentRepository } from "./seat-contracts";
import { isCallerHost, type GameHostReader } from "./host-authorization";

export interface ClaimSeatInput {
  readonly gameId: string;
  readonly seat: number;
  readonly playerToken: string;
  readonly playerName?: string;
  readonly expectedVersion: number;
}

export interface AssignBotInput {
  readonly gameId: string;
  readonly seat: number;
  readonly hostToken: string;
  readonly difficulty?: AIDifficulty;
  readonly bot?: BotDescriptor;
  readonly botProfileId?: BotPlaystyleId | null;
  readonly expectedVersion: number;
}

export type ReleaseSeatInput = Omit<ClaimSeatInput, "playerName">;

export function claimSeat(repository: Pick<AtomicSeatAssignmentRepository, "claimSeatIfVersion">, input: ClaimSeatInput) {
  const { playerName, ...mutation } = input;
  return repository.claimSeatIfVersion({ ...mutation, name: playerName ?? null });
}

export async function assignBotToSeat(
  repository: Pick<AtomicSeatAssignmentRepository, "assignBotIfVersion"> & Pick<SeatAssignmentRepository, "getSeatAssignments"> & GameHostReader,
  input: AssignBotInput,
) {
  const { gameId, seat, hostToken, expectedVersion, difficulty = "medium", bot = {
    id: "jev", label: "TypeSafe Jev", provider: "typesafe", modelId: "jev-latest",
  }, botProfileId = null } = input;
  const assignments = await repository.getSeatAssignments(gameId);
  if (!(await isCallerHost(repository, gameId, hostToken))) throw new Error("Only the host can assign bots");
  const assignment = assignments.find(entry => entry.seat === seat);
  if (!assignment) throw new Error("Seat does not exist");
  if (assignment.status !== "open") throw new Error("Seat is not open");
  return repository.assignBotIfVersion({
    gameId, seat, hostToken, expectedVersion, bot,
    name: `${bot.label} #${assignments.filter(entry => entry.status === "bot").length + 1}`,
    aiDifficulty: bot.provider === "typesafe" || bot.provider === "rules" ? difficulty : null,
    botProfileId: bot.provider === "llm" ? (botProfileId ?? "balanced") : null,
  });
}

export function releaseSeat(repository: Pick<AtomicSeatAssignmentRepository, "releaseSeatIfVersion">, input: ReleaseSeatInput) {
  return repository.releaseSeatIfVersion(input);
}
