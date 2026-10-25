import type { Game } from "./types";
import { turnRemainingMs } from "./turn-clock";

export interface FoldDecision {
  readonly gameId: string;
  readonly handNumber: number;
  readonly version: number;
  readonly actorId: string;
}

/** Validate the live decision, including ownership, rather than a displayed call amount. */
export function foldDecision(game: Game | null, token: string | null, blocked: boolean): FoldDecision | null {
  if (!game || blocked || game.status !== "playing" || game.poker.street === "complete" ||
    (turnRemainingMs(game) ?? 1) <= 0 || !token) return null;
  const actor = game.poker.players.find(player => player.id === game.poker.currentActorId);
  const seat = (game.poker.seats ?? game.poker.players).find(player => player.id === actor?.id);
  if (!actor || actor.controller !== "human" || actor.status !== "claimed" || actor.leaving ||
    actor.playerToken !== token || !seat || seat.playerToken !== token || seat.leaving || seat.status !== "claimed" ||
    !game.poker.legalActions.some(action => action.type === "fold") ||
    !game.poker.legalActions.some(action => action.type === "check")) return null;
  return { gameId: game.id, handNumber: game.poker.handNumber, version: game.version, actorId: actor.id };
}

export function sameFoldDecision(captured: FoldDecision, current: FoldDecision | null): boolean {
  return current !== null && captured.gameId === current.gameId && captured.handNumber === current.handNumber &&
    captured.version === current.version && captured.actorId === current.actorId;
}
