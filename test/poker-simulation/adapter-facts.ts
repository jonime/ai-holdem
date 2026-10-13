// The only simulation helper that knows the third-party engine's state layout.
import { assertTableState, cardToString, type TableState } from "@hivetech/poker-engine";
import type { PokerGameState } from "../../lib/poker/types";

export function accountingFacts(state: PokerGameState) {
  const table = state.engineState as TableState;
  assertTableState(table);
  const hand = table.hand;
  return {
    stacks: Object.fromEntries(table.seats.flatMap(seat => seat ? [[seat.playerId, seat.stack]] : [])),
    players: hand?.players.map(player => ({
      id: player.playerId, committed: player.committedHand, streetCommitted: player.committedStreet,
      folded: player.folded, allIn: player.allIn,
      cards: player.holeCards.map(cardToString), category: player.handRank?.category ?? null,
    })) ?? [],
    pots: hand?.pots ?? [],
    complete: hand?.stage === "complete",
    // Commitments remain historical after settlement; do not add them to settled stacks.
    chipValues: [table.config.smallBlind, table.config.bigBlind,
      ...table.seats.flatMap(seat => seat ? [seat.stack] : []),
      ...(hand ? [hand.currentBet, hand.lastFullRaiseSize,
        ...hand.players.flatMap(p => [p.committedHand, p.committedStreet, ...(p.lastActedBet === null ? [] : [p.lastActedBet])]),
        ...hand.pots.flatMap(p => [p.amount, ...p.awards.map(a => a.amount)])] : [])],
  };
}
