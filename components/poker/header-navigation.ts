import type { PublicPokerPlayer } from "./types";

/** Depart through the header only when another human still owns a seat. */
export function headerDepartureSeat(players: readonly Pick<PublicPokerPlayer, "seat" | "controller" | "status" | "playerToken" | "leaving">[], viewerToken: string | null) {
  const owned = players.find(player => player.controller === "human" && player.status === "claimed" &&
    !player.leaving && viewerToken !== null && player.playerToken === viewerToken);
  const otherHuman = owned && players.some(player => player.seat !== owned.seat &&
    player.controller === "human" && player.status === "claimed");
  return otherHuman ? owned : null;
}
