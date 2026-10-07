import type { PublicPokerPlayer } from "./types";

/** Folding and elimination do not change multiplayer seat ownership. */
export function headerDepartureSeat(players: readonly Pick<PublicPokerPlayer, "seat" | "controller" | "status" | "playerToken" | "leaving">[], viewerToken: string | null) {
  const owned = players.find(player => player.controller === "human" && player.status === "claimed" &&
    !player.leaving && viewerToken !== null && player.playerToken === viewerToken);
  return owned ?? null;
}
