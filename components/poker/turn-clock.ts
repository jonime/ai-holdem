import type { Game } from "./types";

const samples = new WeakMap<Game, { serverMs: number; monotonicMs: number }>();
/** Call only when an authoritative response is accepted, before reconciliation. */
export function observeTurnClock(game: Game, monotonicMs = performance.now()) {
  if (game.serverTime) samples.set(game, { serverMs: Date.parse(game.serverTime), monotonicMs });
}
export function turnRemainingMs(game: Game, monotonicMs = performance.now()): number | null {
  const sample = samples.get(game);
  if (!game.turnTimer || !sample) return null;
  return Math.max(0, Date.parse(game.turnTimer.deadline) - sample.serverMs - Math.max(0, monotonicMs - sample.monotonicMs));
}
