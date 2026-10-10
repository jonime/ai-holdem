import type { Game } from "./types";
import { resolveViewer } from "./view-model";

export function notificationTurn(game: Game | null): string | null {
  if (!game) return null;
  return JSON.stringify([game.id, game.poker.handNumber, game.poker.street,
    game.poker.currentActorId, game.turnTimer?.decisionId ?? null]);
}
export function notificationEligible(game: Game | null, token: string | null,
  blocked: boolean, online: boolean, remaining: number | null): boolean {
  if (!game || game.status !== "playing" || blocked || !online || remaining === 0 || (game.turnTimer && remaining === null)) return false;
  const { viewerPlayer } = resolveViewer(game.poker.players, token);
  return !!viewerPlayer && viewerPlayer.controller === "human" && viewerPlayer.status === "claimed" &&
    !viewerPlayer.leaving && viewerPlayer.id === game.poker.currentActorId && game.poker.legalActions.length > 0;
}
export type TurnObservation = { gameId: string; identity: string; visible: boolean };
/** Observations are consumed even when UI/audio is temporarily unavailable. Never queue cues. */
export function observeNotification(previous: TurnObservation | null,
  gameId: string, identity: string, eligible: boolean, visible: boolean) {
  const sound = !!previous && previous.gameId === gameId && !(visible && !previous.visible) &&
    previous.identity !== identity && eligible;
  return { state: { gameId, identity, visible }, sound };
}
