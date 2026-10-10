import "server-only";
import { removalRpcResultSchema, type RemoveGameRequest } from "@/lib/http/discovery-contracts";
import type { GameReader } from "./game-service-contracts";
import { prepareSeatDeparture } from "./game-service";
import type { GameHostReader } from "./host-authorization";
import type { SeatAssignmentRepository } from "./seat-contracts";
import type { DepartureFold } from "./departure-contracts";

export type RemovalInput = RemoveGameRequest & { gameId: string; playerToken: string };
export class TableRemovalError extends Error {
  constructor(readonly outcome: "missing" | "conflict" | "forbidden" | "blocked") { super(outcome); }
}
export interface RemovalRepository extends GameReader, GameHostReader, Pick<SeatAssignmentRepository, "getSeatAssignments"> {
  removeGameIfVersion(input: RemovalInput & { fold?: DepartureFold }): Promise<unknown>;
}
export async function removeTable(repository: RemovalRepository, input: RemovalInput) {
  let fold: DepartureFold | undefined;
  if (input.operation !== "delete") {
    const isHost = await repository.getHostToken(input.gameId) === input.playerToken;
    if (isHost !== (input.operation === "remove_from_list")) throw new TableRemovalError("forbidden");
    const seat = (await repository.getSeatAssignments(input.gameId)).find(s => s.controller === "human" && s.status === "claimed" && s.playerToken === input.playerToken);
    if (!seat && !isHost) throw new TableRemovalError("forbidden");
    if (seat) fold = await prepareSeatDeparture(repository, { ...input, seat: seat.seat });
  }
  const result = removalRpcResultSchema.parse(await repository.removeGameIfVersion({ ...input, ...(fold ? { fold } : {}) }));
  if (result.outcome !== "ok") throw new TableRemovalError(result.outcome);
  return { version: result.version };
}
