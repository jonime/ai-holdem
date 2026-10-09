import { isCallerHost, type GameHostReader } from "./host-authorization";
import type { SeatAssignmentRepository } from "./seat-contracts";
import type { PokerGameState } from "./types";

export class BotStepForbiddenError extends Error {
  constructor() {
    super("Only the host or a seated human can advance bots");
    this.name = "BotStepForbiddenError";
  }
}

export async function requireBotDriver(
  repository: GameHostReader & Partial<SeatAssignmentRepository>,
  gameId: string,
  state: PokerGameState,
  viewerToken: string | null,
) {
  if (!viewerToken) throw new BotStepForbiddenError();
  if (await isCallerHost(repository, gameId, viewerToken)) return;
  const players = repository.getSeatAssignments
    ? await repository.getSeatAssignments(gameId)
    : state.config.players;
  if (players.some(player => player.controller === "human" &&
      (player.status ?? "claimed") === "claimed" && player.playerToken === viewerToken)) return;
  throw new BotStepForbiddenError();
}

