import { turnRemainingMs } from "./turn-clock";
import { HttpError } from "@/lib/http/api";
import { GAME_VERSION_CONFLICT } from "@/lib/http/gameplay-contracts";
import { canAdvanceBots } from "./view-model";
import type { AIDecision, Game } from "./types";

export function hasAutomaticTurn(game: Game): boolean {
  return game.status === "playing" && game.poker.street !== "complete" &&
    game.poker.players.some(player => player.id === game.poker.currentActorId &&
      (player.controller === "bot" || (player.controller === "human" && player.status === "claimed" &&
        (player.leaving || (game.turnTimer?.actorEngineId === player.id && (turnRemainingMs(game) ?? 1) <= 0)))));
}

/** All entry points stop their stale loop and refresh on a competing commit. */
export async function advanceBotTurns(
  initial: Game,
  driver: {
    readonly viewerToken: () => string | null;
    readonly isActive: () => boolean;
    readonly step: (game: Game) => Promise<{ game: Game; aiDecision?: AIDecision }>;
    readonly apply: (result: { game: Game; aiDecision?: AIDecision }) => void;
    readonly refresh: () => Promise<unknown>;
  },
): Promise<void> {
  let current = initial;
  for (let attempts = 0; attempts < 12 && hasAutomaticTurn(current) &&
    driver.isActive() && canAdvanceBots(current, driver.viewerToken()); attempts++) {
    let result;
    try {
      result = await driver.step(current);
    } catch (error) {
      if (!driver.isActive()) return;
      if (error instanceof HttpError && error.code === GAME_VERSION_CONFLICT) {
        await driver.refresh();
        return;
      }
      throw error;
    }
    if (!driver.isActive()) return;
    current = result.game;
    driver.apply(result);
  }
}
