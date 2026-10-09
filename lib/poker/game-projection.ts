import { pokerEngineAdapter } from "./adapter";
import type { BotDescriptor, PokerGameState, PokerPlayerConfig, PublicPokerGame } from "./types";
import type { SeatAssignment, SeatAssignmentRepository } from "./seat-contracts";
import type { HandRevealReader } from "./game-service-contracts";
import type { PersistedGame } from "@/lib/supabase/queries";

export function enginePlayerIdForAssignment(
  gameId: string,
  assignment: SeatAssignment,
): string {
  return (
    assignment.enginePlayerId ??
    `${assignment.status === "bot" ? "bot" : "player"}-${gameId}-${assignment.seat}`
  );
}

export function supportsDifficulty(
  provider: BotDescriptor["provider"] | null | undefined,
) {
  return provider === "typesafe" || provider === "rules";
}

export function playerConfigForAssignment(
  gameId: string,
  assignment: SeatAssignment,
  startingStack: number,
): PokerPlayerConfig {
  return {
    id: enginePlayerIdForAssignment(gameId, assignment),
    seat: assignment.seat,
    name:
      assignment.name ??
      (assignment.status === "bot"
        ? (assignment.bot?.label ?? "TypeSafe Jev")
        : `Player ${assignment.seat + 1}`),
    controller: assignment.controller,
    bot: assignment.controller === "bot" ? assignment.bot : null,
    aiDifficulty: supportsDifficulty(assignment.bot?.provider)
      ? (assignment.aiDifficulty ?? "medium")
      : null,
    botProfileId:
      assignment.bot?.provider === "llm"
        ? (assignment.botProfileId ?? "balanced")
        : null,
    stack: startingStack,
    status: assignment.status,
    playerToken: assignment.playerToken,
    isHost: assignment.isHost,
    leaving: assignment.leaving ?? false,
  };
}

export async function withOpenSeatPlaceholders(
  repository: SeatAssignmentRepository,
  gameId: string,
  state: PokerGameState,
): Promise<PokerGameState & { readonly seatAssignments: readonly SeatAssignment[] }> {
  const assignments = await repository.getSeatAssignments(gameId);
  return reconcilePublicSeats(gameId, state, assignments);
}

export function reconcilePublicSeats(
  gameId: string,
  state: PokerGameState,
  assignments: readonly SeatAssignment[],
): PokerGameState & { readonly seatAssignments: readonly SeatAssignment[] } {
  const startingStack =
    state.config.startingStack ?? state.config.players[0]?.stack ?? 10_000;
  const assignmentsById = new Map(
    assignments
      .filter((assignment) => assignment.enginePlayerId)
      .map((assignment) => [assignment.enginePlayerId, assignment]),
  );
  const assignmentsBySeat = new Map(
    assignments.map((assignment) => [assignment.seat, assignment]),
  );
  const configuredPlayerIds = new Set(
    state.config.players.map((player) => player.id),
  );
  const completed = pokerEngineAdapter.snapshot(state).street === "complete";
  const players = state.config.players.map((player) => {
    const assignment =
      assignmentsById.get(player.id) ?? assignmentsBySeat.get(player.seat);
    // Completed participants retain their immutable identity and private ownership.
    // Seat availability is separate from their engine participation and awards.
    if (completed) {
      const retained = assignment?.enginePlayerId === player.id;
      return { ...player, status: retained ? assignment.status : "open" as const,
        leaving: retained ? (assignment.leaving ?? false) : true,
        isHost: retained ? assignment.isHost : false };
    }
    return assignment
      ? {
          ...player,
          seat: assignment.seat,
          name: assignment.name ?? player.name,
          controller: assignment.controller,
          bot: assignment.controller === "bot" ? assignment.bot : null,
          aiDifficulty: supportsDifficulty(assignment.bot?.provider)
            ? (assignment.aiDifficulty ?? "medium")
            : null,
          botProfileId:
            assignment.bot?.provider === "llm"
              ? (assignment.botProfileId ?? "balanced")
              : null,
          status: assignment.status,
          playerToken: assignment.playerToken,
          isHost: assignment.isHost,
          leaving: assignment.leaving ?? false,
        }
      : player;
  });
  const configuredSeats = new Set(players.map((player) => player.seat));
  for (const assignment of assignments) {
    if (
      assignment.enginePlayerId &&
      configuredPlayerIds.has(assignment.enginePlayerId)
    ) {
      continue;
    }
    if (configuredSeats.has(assignment.seat)) continue;
    players.push(playerConfigForAssignment(gameId, assignment, startingStack));
    configuredSeats.add(assignment.seat);
  }
  return {
    ...state,
    seatAssignments: assignments,
    config: {
      ...state.config,
      players,
    },
  };
}

export function publicLiveSeats(state: PokerGameState, assignments: readonly SeatAssignment[], viewerToken: string | null) {
  const players = pokerEngineAdapter.publicProjection(state, null).players;
  return assignments.map(seat => ({
    id: enginePlayerIdForAssignment(seat.gameId, seat), seat: seat.seat,
    status: seat.status, controller: seat.controller, leaving: seat.leaving ?? false,
    playerToken: viewerToken && seat.playerToken === viewerToken ? viewerToken : null,
    stack: seat.status === "open" ? 0 : players.find(player => player.id === seat.enginePlayerId)?.stack
      ?? state.config.startingStack ?? state.config.players[0]?.stack ?? 10_000,
  }));
}

export function publicProjectionForViewer(
  state: PokerGameState & { readonly seatAssignments?: readonly SeatAssignment[] },
  viewerToken: string | null,
  revealedPlayerIds: readonly string[] = [],
  botsShowUncontestedWins = false,
): PublicPokerGame {
  const viewerPlayerId = viewerToken
    ? (state.config.players.find(
        (player) =>
          player.playerToken === viewerToken || player.id === viewerToken,
      )?.id ?? null)
    : null;
  return {
    ...pokerEngineAdapter.publicProjection(
      state,
      viewerPlayerId,
      revealedPlayerIds,
    ),
    botsShowUncontestedWins,
    ...(state.seatAssignments ? { seats: publicLiveSeats(state, state.seatAssignments, viewerToken) } : {}),
  };
}

export async function currentRevealIds(
  repository: Partial<HandRevealReader>,
  gameId: string,
  handNumber: number,
): Promise<readonly string[]> {
  return repository.getCurrentHandRevealedPlayerIds
    ? repository.getCurrentHandRevealedPlayerIds(gameId, handNumber)
    : [];
}

export function autoRevealForCompletedState(
  state: PokerGameState,
  botsShowUncontestedWins: boolean,
): { playerId: string; reason: "bot_uncontested" } | null {
  const snapshot = pokerEngineAdapter.snapshot(state);
  if (!botsShowUncontestedWins || snapshot.completionReason !== "fold") {
    return null;
  }
  if (snapshot.winnerIds.length !== 1) return null;
  const winner = state.config.players.find(
    (player) => player.id === snapshot.winnerIds[0],
  );
  return winner && winner.controller !== "human"
    ? { playerId: winner.id, reason: "bot_uncontested" }
    : null;
}

export function publicTimerFields(game: PersistedGame) {
  return { turnTimer: game.turnTimer ?? null, serverTime: game.serverTime ?? new Date().toISOString() };
}

